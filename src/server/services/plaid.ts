import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
} from 'plaid'
import { uid } from '#/lib/utils'
import { getEnv } from '#/lib/env'
import { getDb, schema } from '../db'
import { now } from '../db/schema'
import type { AccountType } from '../db/schema'
import type { CountryCode, Products } from 'plaid'

function getPlaidConfig(): { client: PlaidApi; env: string } | null {
  const clientId = getEnv('PLAID_CLIENT_ID')
  const secret = getEnv('PLAID_SECRET')
  if (!clientId || !secret) return null
  const env = String(getEnv('PLAID_ENV') ?? 'sandbox')
  const basePath = (PlaidEnvironments as Record<string, string>)[env] ?? PlaidEnvironments.sandbox
  const client = new PlaidApi(
    new Configuration({
      basePath,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': clientId,
          'PLAID-SECRET': secret,
        },
      },
    }),
  )
  return { client, env }
}

export function isPlaidConfigured(): boolean {
  return Boolean(getEnv('PLAID_CLIENT_ID') && getEnv('PLAID_SECRET'))
}

export async function createLinkToken(userId: string) {
  const cfg = getPlaidConfig()
  if (!cfg) {
    throw new Error('Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.')
  }
  const { data } = await cfg.client.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'IntelliPF',
    language: 'en',
    country_codes: ['US'] as CountryCode[],
    products: ['transactions', 'investments', 'auth'] as Products[],
    transactions: { days_requested: 730 },
  })
  return { linkToken: data.link_token, expiration: data.expiration }
}

export async function exchangePublicToken(userId: string, publicToken: string) {
  const cfg = getPlaidConfig()
  if (!cfg) {
    throw new Error('Plaid is not configured.')
  }
  const { data } = await cfg.client.itemPublicTokenExchange({ public_token: publicToken })
  const itemId = uid('item')
  const institutionId = (data as { institution_id?: string }).institution_id ?? null
  let institutionName: string | null = null
  try {
    const { data: institutionData } = await cfg.client.institutionsGetById({
      institution_id: institutionId ?? '',
      country_codes: ['US'] as CountryCode[],
    })
    institutionName = institutionData.institution.name ?? null
  } catch {
    institutionName = null
  }

  const db = getDb()
  await db.insert(schema.plaidItems).values({
    id: itemId,
    userId,
    plaidItemId: data.item_id,
    accessToken: data.access_token,
    institutionId: institutionId ?? undefined,
    institutionName: institutionName ?? undefined,
  })

  await fetchAccountsForItem(itemId)
  return { itemId }
}

export async function fetchAccountsForItem(itemId: string) {
  const cfg = getPlaidConfig()
  if (!cfg) {
    throw new Error('Plaid is not configured.')
  }
  const db = getDb()
  const [item] = await db
    .select()
    .from(schema.plaidItems)
    .where(eq(schema.plaidItems.id, itemId))
    .limit(1)
  if (!item) throw new Error('Plaid item not found')

  const { data } = await cfg.client.accountsGet({ access_token: item.accessToken })
  const existing = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.plaidItemId, itemId))

  const seenPlaidAccountIds = new Set<string>()

  for (const plaidAccount of data.accounts) {
    seenPlaidAccountIds.add(plaidAccount.account_id)
    const mappedType = mapPlaidAccountType(plaidAccount.type, plaidAccount.subtype)
    const values = {
      userId: item.userId,
      plaidItemId: itemId,
      plaidAccountId: plaidAccount.account_id,
      source: 'plaid' as const,
      name: plaidAccount.name,
      officialName: plaidAccount.official_name ?? null,
      type: mappedType,
      subtype: plaidAccount.subtype ?? undefined,
      mask: plaidAccount.mask ?? null,
      institutionName: item.institutionName,
      currencyCode: plaidAccount.balances?.iso_currency_code ?? 'USD',
      isActive: true,
    }
    const found = existing.find(
      (a) => a.plaidAccountId === plaidAccount.account_id,
    )
    let accountId: string
    if (found) {
      accountId = found.id
      await db.update(schema.accounts).set({ ...values, updatedAt: now }).where(eq(schema.accounts.id, accountId))
    } else {
      accountId = uid('acc')
      await db.insert(schema.accounts).values({ id: accountId, ...values })
    }

    const balance = plaidAccount.balances
    if (balance && (balance.current != null || balance.available != null)) {
      await upsertBalance(
        item.userId,
        accountId,
        balance.current ?? null,
        balance.available ?? null,
        balance.limit ?? null,
      )
    }
  }

  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.plaidItemId, itemId), ne(schema.accounts.isActive, false)))
  for (const account of accounts) {
    if (!seenPlaidAccountIds.has(account.plaidAccountId ?? '')) {
      await db
        .update(schema.accounts)
        .set({ isActive: false, updatedAt: now })
        .where(eq(schema.accounts.id, account.id))
    }
  }

  await db.update(schema.plaidItems).set({ lastSyncAt: now, updatedAt: now }).where(eq(schema.plaidItems.id, itemId))
  return { accountCount: seenPlaidAccountIds.size }
}

function mapPlaidAccountType(type: string, subtype?: string | null): AccountType {
  const t = type.toLowerCase()
  if (t === 'depository' || t === 'credit' || t === 'loan' || t === 'insurance' || t === 'other') {
    return t
  }
  if (t === 'investment') {
    return (subtype ?? '').includes('brokerage') ? 'brokerage' : 'investment'
  }
  return 'other'
}

async function upsertBalance(
  userId: string,
  accountId: string,
  current: number | null,
  available: number | null,
  limit: number | null,
) {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const [existing] = await db
    .select()
    .from(schema.balances)
    .where(and(eq(schema.balances.accountId, accountId), eq(schema.balances.date, today)))
    .limit(1)
  if (existing) {
    await db
      .update(schema.balances)
      .set({ current, available, limit, userId })
      .where(eq(schema.balances.id, existing.id))
  } else {
    await db.insert(schema.balances).values({
      id: uid('bal'),
      userId,
      accountId,
      date: today,
      current,
      available,
      limit,
    })
  }
}

export async function syncTransactionsForItem(itemId: string) {
  const cfg = getPlaidConfig()
  if (!cfg) {
    throw new Error('Plaid is not configured.')
  }
  const db = getDb()
  const [item] = await db
    .select()
    .from(schema.plaidItems)
    .where(eq(schema.plaidItems.id, itemId))
    .limit(1)
  if (!item) throw new Error('Plaid item not found')

  const accountMap = new Map<string, string>()
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.plaidItemId, itemId), eq(schema.accounts.isActive, true)))
  for (const account of accounts) {
    if (account.plaidAccountId) accountMap.set(account.plaidAccountId, account.id)
  }

  let cursor = item.cursor ?? undefined
  let added: Array<Record<string, unknown>> = []
  let modified: Array<Record<string, unknown>> = []
  let removed: Array<{ transaction_id: string }> = []
  let hasMore = true

  while (hasMore) {
    const { data } = await cfg.client.transactionsSync({
      access_token: item.accessToken,
      cursor,
    })
    added = [...added, ...(data.added as unknown as Array<Record<string, unknown>>)]
    modified = [...modified, ...(data.modified as unknown as Array<Record<string, unknown>>)]
    removed = [...removed, ...data.removed]
    cursor = data.next_cursor
    hasMore = data.has_more
  }

  const addedCount = added.length
  const modifiedCount = modified.length
  const removedCount = removed.length

  for (const tx of added) {
    await upsertPlaidTransaction(item.userId, tx, accountMap)
  }
  for (const tx of modified) {
    await upsertPlaidTransaction(item.userId, tx, accountMap)
  }
  for (const r of removed) {
    const existingTx = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.plaidTransactionId, r.transaction_id))
      .limit(1)
    if (existingTx[0]) {
      await db.delete(schema.transactions).where(eq(schema.transactions.id, existingTx[0].id))
    }
  }

  await db
    .update(schema.plaidItems)
    .set({ cursor: cursor ?? undefined, lastSyncAt: now, updatedAt: now })
    .where(eq(schema.plaidItems.id, itemId))

  return { added: addedCount, modified: modifiedCount, removed: removedCount }
}

async function upsertPlaidTransaction(
  userId: string,
  tx: Record<string, unknown>,
  accountMap: Map<string, string>,
) {
  const db = getDb()
  const plaidTransactionId = String(tx['transaction_id'])
  const plaidAccountId = String(tx['account_id'])
  const accountId = accountMap.get(plaidAccountId)
  if (!accountId) return

  const amount = Number(tx['amount'] ?? 0)
  const date = String(tx['date'])
  const values = {
    userId,
    accountId,
    plaidTransactionId,
    source: 'plaid' as const,
    amount,
    name: String(tx['name'] ?? ''),
    merchantName: tx['merchant_name'] ? String(tx['merchant_name']) : null,
    category: tx['category'] ? JSON.stringify(tx['category']) : null,
    date,
    currencyCode: String(tx['iso_currency_code'] ?? 'USD'),
    pending: Boolean(tx['pending']),
  }
  const existing = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.plaidTransactionId, plaidTransactionId))
    .limit(1)
  if (existing[0]) {
    await db
      .update(schema.transactions)
      .set(values)
      .where(eq(schema.transactions.id, existing[0].id))
  } else {
    await db.insert(schema.transactions).values({ id: uid('txn'), ...values })
  }
}

export async function syncInvestmentHoldingsForItem(itemId: string) {
  const cfg = getPlaidConfig()
  if (!cfg) {
    throw new Error('Plaid is not configured.')
  }
  const db = getDb()
  const [item] = await db
    .select()
    .from(schema.plaidItems)
    .where(eq(schema.plaidItems.id, itemId))
    .limit(1)
  if (!item) throw new Error('Plaid item not found')

  let holdingsResponse
  let securitiesResponse
  try {
    ;[holdingsResponse, securitiesResponse] = await Promise.all([
      cfg.client.investmentsHoldingsGet({ access_token: item.accessToken }),
      cfg.client.investmentsAuthGet({ access_token: item.accessToken }),
    ])
  } catch {
    return { synced: false, holdings: 0, reason: 'item_has_no_investment_products' }
  }

  const accountMap = new Map<string, string>()
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.plaidItemId, itemId), eq(schema.accounts.isActive, true)))
  for (const account of accounts) {
    if (account.plaidAccountId) accountMap.set(account.plaidAccountId, account.id)
  }

  const securities = securitiesResponse?.data?.securities ?? []
  const securityMap = new Map<string, string>()
  for (const security of securities) {
    const ticker = security.ticker_symbol ?? null
    const securityId = await upsertSecurity({
      ticker,
      name: security.name ?? null,
      type: mapSecurityType(security.type, security.subtype),
      currency: security.iso_currency_code ?? 'USD',
      isin: security.isin ?? null,
    })
    securityMap.set(security.security_id, securityId)
  }

  const holdings = holdingsResponse?.data?.holdings ?? []
  let holdingCount = 0
  for (const holding of holdings) {
    const accountId = accountMap.get(holding.account_id)
    if (!accountId) continue
    const securityId = securityMap.get(holding.security_id)
    if (!securityId) continue
    const quantity = Number(holding.quantity ?? 0)
    const price = holding.institution_price ?? holding.institution_price_as_of ?? null
    await upsertHolding({
      accountId,
      securityId,
      quantity,
      costBasis: holding.cost_basis ? Number(holding.cost_basis) : null,
      price: price != null ? Number(price) : null,
    })
    holdingCount++
  }

  await db.update(schema.plaidItems).set({ updatedAt: now }).where(eq(schema.plaidItems.id, itemId))
  return { synced: true, holdings: holdingCount }
}

function mapSecurityType(type?: string | null, subtype?: string | null) {
  if (subtype?.includes('mutual') || subtype?.includes('fund')) return 'fund'
  const t = (type ?? '').toLowerCase()
  if (t === 'cash') return 'cash'
  if (t === 'etf') return 'etf'
  if (t === 'equity' || t === 'stock' || t === 'cef' || t === 'right' || t === 'warrant') return 'stock'
  if (t === 'fixed_income' || t === 'bond' || t === 'cd') return 'bond'
  if (t === 'crypto' || t === 'currency' || t === 'commodity') return 'commodity'
  return 'other'
}

async function upsertSecurity(input: {
  ticker: string | null
  name: string | null
  type: string
  currency: string
  isin: string | null
}) {
  const db = getDb()
  const existing = await db
    .select()
    .from(schema.securities)
    .where(eq(schema.securities.ticker, input.ticker ?? ''))
    .limit(1)
  if (existing[0]) return existing[0].id
  const id = uid('sec')
  await db.insert(schema.securities).values({
    id,
    ticker: input.ticker ?? undefined,
    name: input.name ?? undefined,
    type: input.type,
    currency: input.currency,
    isin: input.isin ?? undefined,
  })
  return id
}

async function upsertHolding(input: {
  accountId: string
  securityId: string
  quantity: number
  costBasis: number | null
  price: number | null
}) {
  const db = getDb()
  const [existing] = await db
    .select()
    .from(schema.holdings)
    .where(
      and(
        eq(schema.holdings.accountId, input.accountId),
        eq(schema.holdings.securityId, input.securityId),
      ),
    )
    .limit(1)
  const values = {
    quantity: input.quantity,
    costBasis: input.costBasis,
    price: input.price,
    priceAsOf: input.price != null ? new Date().toISOString().slice(0, 10) : undefined,
    updatedAt: now,
  }
  if (existing) {
    await db.update(schema.holdings).set(values).where(eq(schema.holdings.id, existing.id))
  } else {
    await db.insert(schema.holdings).values({
      id: uid('hol'),
      accountId: input.accountId,
      securityId: input.securityId,
      ...values,
    })
  }
}

export async function syncAllPlaidForUser(userId: string) {
  const db = getDb()
  const items = await db
    .select()
    .from(schema.plaidItems)
    .where(eq(schema.plaidItems.userId, userId))
  const results: Array<{
    itemId: string
    transactions: { added: number; modified: number; removed: number }
    holdings: { synced: boolean; holdings: number; reason?: string }
  }> = []
  for (const item of items) {
    const transactions = await syncTransactionsForItem(item.id)
    const holdings = await syncInvestmentHoldingsForItem(item.id)
    results.push({ itemId: item.id, transactions, holdings })
  }
  return results
}

export async function listPlaidItems(userId: string) {
  const db = getDb()
  const items = await db
    .select()
    .from(schema.plaidItems)
    .where(eq(schema.plaidItems.userId, userId))
    .orderBy(asc(schema.plaidItems.createdAt))
  const accountRows = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId))
  return items.map((item) => ({
    ...item,
    accounts: accountRows.filter((a) => a.plaidItemId === item.id),
  }))
}

export async function removePlaidItem(userId: string, itemId: string) {
  const cfg = getPlaidConfig()
  const db = getDb()
  const [item] = await db
    .select()
    .from(schema.plaidItems)
    .where(and(eq(schema.plaidItems.id, itemId), eq(schema.plaidItems.userId, userId)))
    .limit(1)
  if (!item) return false
  if (cfg) {
    try {
      await cfg.client.itemRemove({ access_token: item.accessToken })
    } catch {
      // token may already be invalid server-side
    }
  }
  const accountIds = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.plaidItemId, itemId))
  if (accountIds.length > 0) {
    await db
      .delete(schema.transactions)
      .where(inArray(schema.transactions.accountId, accountIds.map((a) => a.id)))
    await db
      .delete(schema.balances)
      .where(inArray(schema.balances.accountId, accountIds.map((a) => a.id)))
    await db.delete(schema.holdings).where(inArray(schema.holdings.accountId, accountIds.map((a) => a.id)))
    await db.delete(schema.accounts).where(inArray(schema.accounts.id, accountIds.map((a) => a.id)))
  }
  await db.delete(schema.plaidItems).where(eq(schema.plaidItems.id, itemId))
  return true
}
