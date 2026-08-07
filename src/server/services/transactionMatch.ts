import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { uid } from '#/lib/utils'
import { getDb, schema } from '../db'
import { now } from '../db/schema'

export interface PlaidTransactionLike {
  transaction_id?: unknown
  account_id?: unknown
  amount?: unknown
  date?: unknown
  name?: unknown
  merchant_name?: unknown
  iso_currency_code?: unknown
  pending?: unknown
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function sameTransactionName(
  localName: string,
  localMerchant: string | null,
  plaidName: string,
): boolean {
  const p = normalizeName(plaidName)
  if (!p) return false
  const n = normalizeName(localName)
  const m = normalizeName(localMerchant ?? '')
  return (n !== '' && n === p) || (m !== '' && m === p)
}

export interface LocalMatch {
  transaction: typeof schema.transactions.$inferSelect
  confidence: 'high' | 'low'
}

const AMOUNT_TOLERANCE = 0.01

export async function findLocalMatch(
  userId: string,
  accountId: string,
  plaidTx: PlaidTransactionLike,
): Promise<LocalMatch | null> {
  const db = getDb()
  const date = String(plaidTx.date ?? '')
  const amount = Math.abs(Number(plaidTx.amount ?? 0))
  if (!date || !Number.isFinite(amount)) return null

  const candidates = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.userId, userId),
        eq(schema.transactions.accountId, accountId),
        eq(schema.transactions.date, date),
        isNull(schema.transactions.plaidTransactionId),
        sql`${schema.transactions.source} IN ('qif', 'manual')`,
      ),
    )
    .limit(100)

  const matching = candidates.filter(
    (tx) => Math.abs(Math.abs(tx.amount) - amount) <= AMOUNT_TOLERANCE,
  )
  if (matching.length === 0) return null

  const plaidName = String(plaidTx.name ?? plaidTx.merchant_name ?? '')
  const exact = matching.find((tx) => sameTransactionName(tx.name, tx.merchantName, plaidName))
  if (exact) return { transaction: exact, confidence: 'high' }

  return { transaction: matching[0]!, confidence: 'low' }
}

export async function recordMatchReview(input: {
  userId: string
  accountId: string
  localTransactionId: string
  onlineTransactionId: string
}): Promise<void> {
  const db = getDb()
  const [existing] = await db
    .select()
    .from(schema.transactionMatchReviews)
    .where(
      and(
        eq(schema.transactionMatchReviews.localTransactionId, input.localTransactionId),
        eq(schema.transactionMatchReviews.onlineTransactionId, input.onlineTransactionId),
      ),
    )
    .limit(1)
  if (existing) return
  await db.insert(schema.transactionMatchReviews).values({
    id: uid('mrev'),
    userId: input.userId,
    accountId: input.accountId,
    localTransactionId: input.localTransactionId,
    onlineTransactionId: input.onlineTransactionId,
    status: 'pending',
  })
}

export async function markReviewMerged(
  localTransactionId: string,
  onlineTransactionId: string,
): Promise<void> {
  const db = getDb()
  await db
    .update(schema.transactionMatchReviews)
    .set({ status: 'merged', updatedAt: now })
    .where(
      and(
        eq(schema.transactionMatchReviews.localTransactionId, localTransactionId),
        eq(schema.transactionMatchReviews.onlineTransactionId, onlineTransactionId),
      ),
    )
}

export async function deleteReviewsForOnlineId(onlineTransactionId: string): Promise<void> {
  const db = getDb()
  await db
    .delete(schema.transactionMatchReviews)
    .where(eq(schema.transactionMatchReviews.onlineTransactionId, onlineTransactionId))
}

export interface MatchReviewRow {
  id: string
  accountId: string
  accountName: string
  local: typeof schema.transactions.$inferSelect | null
  online: typeof schema.transactions.$inferSelect | null
}

export async function listPendingReviews(
  userId: string,
  accountId?: string,
): Promise<MatchReviewRow[]> {
  const db = getDb()
  const conditions = [
    eq(schema.transactionMatchReviews.userId, userId),
    eq(schema.transactionMatchReviews.status, 'pending'),
  ]
  if (accountId) conditions.push(eq(schema.transactionMatchReviews.accountId, accountId))

  const reviews = await db
    .select()
    .from(schema.transactionMatchReviews)
    .where(and(...conditions))
    .orderBy(asc(schema.transactionMatchReviews.createdAt))

  if (reviews.length === 0) return []

  const accountRows = await db
    .select()
    .from(schema.accounts)
    .where(inArray(schema.accounts.id, [...new Set(reviews.map((r) => r.accountId))]))
  const localRows = await db
    .select()
    .from(schema.transactions)
    .where(inArray(schema.transactions.id, reviews.map((r) => r.localTransactionId)))
  const onlineRows = await db
    .select()
    .from(schema.transactions)
    .where(
      inArray(
        schema.transactions.plaidTransactionId,
        reviews.map((r) => r.onlineTransactionId),
      ),
    )

  const accountById = new Map(accountRows.map((a) => [a.id, a]))
  const localById = new Map(localRows.map((t) => [t.id, t]))
  const onlineByPlaidId = new Map(onlineRows.map((t) => [t.plaidTransactionId, t]))

  return reviews.map((review) => ({
    id: review.id,
    accountId: review.accountId,
    accountName: accountById.get(review.accountId)?.name ?? '',
    local: localById.get(review.localTransactionId) ?? null,
    online: onlineByPlaidId.get(review.onlineTransactionId) ?? null,
  }))
}

export async function countPendingReviewsForAccount(accountId: string): Promise<number> {
  const db = getDb()
  const rows = await db
    .select({ id: schema.transactionMatchReviews.id })
    .from(schema.transactionMatchReviews)
    .where(
      and(
        eq(schema.transactionMatchReviews.accountId, accountId),
        eq(schema.transactionMatchReviews.status, 'pending'),
      ),
    )
  return rows.length
}

export async function resolveMatchReview(
  userId: string,
  reviewId: string,
  action: 'merge' | 'dismiss',
): Promise<boolean> {
  const db = getDb()
  const [review] = await db
    .select()
    .from(schema.transactionMatchReviews)
    .where(eq(schema.transactionMatchReviews.id, reviewId))
    .limit(1)
  if (!review || review.userId !== userId || review.status !== 'pending') return false

  if (action === 'dismiss') {
    await db
      .update(schema.transactionMatchReviews)
      .set({ status: 'dismissed', updatedAt: now })
      .where(eq(schema.transactionMatchReviews.id, reviewId))
    return true
  }

  const [online] = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.plaidTransactionId, review.onlineTransactionId))
    .limit(1)
  const [local] = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, review.localTransactionId))
    .limit(1)
  if (!online || !local) return false

  await db
    .update(schema.transactions)
    .set({
      plaidTransactionId: review.onlineTransactionId,
      name: online.name,
      merchantName: online.merchantName,
      amount: online.amount,
      date: online.date,
      currencyCode: online.currencyCode,
      pending: online.pending,
    })
    .where(eq(schema.transactions.id, local.id))

  await db.delete(schema.transactions).where(eq(schema.transactions.id, online.id))

  await db
    .update(schema.transactionMatchReviews)
    .set({ status: 'merged', updatedAt: now })
    .where(eq(schema.transactionMatchReviews.id, reviewId))
  return true
}
