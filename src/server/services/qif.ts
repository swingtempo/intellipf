import { and, eq } from 'drizzle-orm'
import { parse } from 'date-fns'
import { uid } from '#/lib/utils'
import { getDb, schema } from '../db'
import { now } from '../db/schema'

export interface QifRecord {
  fields: Record<string, string>
  splits: Array<{ category?: string; memo?: string; amount?: number }>
}

export interface QifSection {
  type: string
  records: QifRecord[]
}

export interface QifAccountDef {
  name?: string
  type?: string
  description?: string
}

export interface ParsedQif {
  sections: QifSection[]
  accounts: QifAccountDef[]
}

export function parseQif(content: string): ParsedQif {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const accounts: QifAccountDef[] = []
  const sections: QifSection[] = []
  let currentSection: QifSection | null = null
  let currentRecord: QifRecord | null = null
  let accountDef: QifAccountDef | null = null
  let inAccountSection = false

  const flushRecord = () => {
    if (currentRecord) {
      if (currentSection) currentSection.records.push(currentRecord)
      currentRecord = null
    }
  }
  const flushAccount = () => {
    if (accountDef) {
      accounts.push(accountDef)
      accountDef = null
    }
  }

  for (const line of lines) {
    if (line.startsWith('!')) {
      flushRecord()
      flushAccount()
      inAccountSection = false
      if (line === '!Account') {
        inAccountSection = true
        accountDef = {}
        continue
      }
      if (line.startsWith('!Type:')) {
        const type = line.slice('!Type:'.length).trim()
        currentSection = { type, records: [] }
        sections.push(currentSection)
        continue
      }
      continue
    }

    if (inAccountSection) {
      const code = line[0]
      const value = line.slice(1)
      if (code === '^') {
        flushAccount()
        continue
      }
      if (code === 'N') accountDef = { ...accountDef, name: value }
      else if (code === 'T') accountDef = { ...accountDef, type: value }
      else if (code === 'D') accountDef = { ...accountDef, description: value }
      continue
    }

    if (!currentSection) continue
    const code = line[0]
    const value = line.slice(1)

    if (code === '^') {
      flushRecord()
      continue
    }

    if (!currentRecord) {
      currentRecord = { fields: {}, splits: [] }
    }

    switch (code) {
      case 'S': {
        const splits = currentRecord.splits
        if (splits.length > 0 && splits[splits.length - 1]?.category == null && splits[splits.length - 1]?.amount == null) {
          splits[splits.length - 1].category = value
        } else {
          splits.push({ category: value })
        }
        break
      }
      case '$': {
        const splits = currentRecord.splits
        if (splits.length > 0 && splits[splits.length - 1]?.amount == null) {
          splits[splits.length - 1].amount = parseQifAmount(value)
        } else {
          splits.push({ amount: parseQifAmount(value) })
        }
        break
      }
      case 'E': {
        const splits = currentRecord.splits
        if (splits.length > 0 && splits[splits.length - 1]?.memo == null) {
          splits[splits.length - 1].memo = value
        }
        break
      }
      default: {
        currentRecord.fields[code] = value
      }
    }
  }

  flushRecord()
  flushAccount()

  return { sections, accounts }
}

export function parseQifAmount(raw: string): number {
  if (raw == null || raw === '') return 0
  let value = raw.replace(/,/g, '').trim()
  let sign = 1
  if (value.startsWith('(') && value.endsWith(')')) {
    sign = -1
    value = value.slice(1, -1)
  } else if (value.startsWith('-')) {
    sign = -1
    value = value.slice(1)
  }
  const num = Number(value)
  return Number.isFinite(num) ? num * sign : 0
}

const DATE_FORMATS = ['yyyy-MM-dd', 'MM/dd/yyyy', 'MM/dd/yy', "MM/dd'yy", 'M/d/yyyy', 'M/d/yy', 'MM/dd', 'M/d']

export function parseQifDate(raw: string): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  for (const fmt of DATE_FORMATS) {
    const parsed = parse(value, fmt, new Date())
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear()
      const month = String(parsed.getMonth() + 1).padStart(2, '0')
      const day = String(parsed.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }
  return null
}

export interface ImportQifInput {
  userId: string
  accountId?: string | null
  fileName: string
  content: string
  accountName?: string | null
}

export interface ImportQifResult {
  accountsCreated: Array<{ id: string; name: string; type: string }>
  accountUsed: { id: string; name: string }
  transactionsImported: number
  holdingsChanged: number
  sectionsFound: string[]
}

function accountTypeFromQifType(qifType: string): 'depository' | 'credit' | 'brokerage' | 'investment' | 'other' {
  const t = qifType.toUpperCase()
  if (t === 'BANK' || t === 'CASH') return 'depository'
  if (t === 'CCARD') return 'credit'
  if (t === 'INVST' || t === 'PORTFOLIO' || t === '401K') return 'brokerage'
  if (t === 'Oth L') return 'other'
  if (t === 'Oth A') return 'depository'
  return 'other'
}

async function resolveAccount(
  userId: string,
  input: ImportQifInput,
  qifType: string,
  parsedAccounts: QifAccountDef[],
): Promise<{ id: string; name: string; type: string }> {
  const db = getDb()
  if (input.accountId) {
    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(and(eq(schema.accounts.id, input.accountId), eq(schema.accounts.userId, userId)))
      .limit(1)
    if (account) return { id: account.id, name: account.name, type: account.type }
  }

  const desiredName = input.accountName?.trim() || parsedAccounts[0]?.name?.trim() || ''
  if (desiredName) {
    const matches = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId))
    const found = matches.find(
      (a) => a.name.toLowerCase() === desiredName.toLowerCase() && a.source === 'qif',
    )
    if (found) return { id: found.id, name: found.name, type: found.type }
  }

  const name = desiredName || input.fileName.replace(/\.qif$/i, '') || 'Imported Account'
  const type = accountTypeFromQifType(qifType)
  const id = uid('acc')
  await db.insert(schema.accounts).values({
    id,
    userId,
    source: 'qif',
    name,
    type,
    isActive: true,
  })
  return { id, name, type }
}

async function findOrCreateSecurity(ticker: string | null, name: string | null): Promise<string> {
  const db = getDb()
  if (ticker) {
    const existing = await db
      .select()
      .from(schema.securities)
      .where(eq(schema.securities.ticker, ticker))
      .limit(1)
    if (existing[0]) return existing[0].id
  }
  const id = uid('sec')
  await db.insert(schema.securities).values({
    id,
    ticker: ticker ?? undefined,
    name: name ?? undefined,
    type: 'stock',
  })
  return id
}

async function adjustHolding(
  accountId: string,
  securityId: string,
  quantityDelta: number,
  costBasis: number | null,
) {
  const db = getDb()
  const [existing] = await db
    .select()
    .from(schema.holdings)
    .where(and(eq(schema.holdings.accountId, accountId), eq(schema.holdings.securityId, securityId)))
    .limit(1)
  if (existing) {
    const oldQuantity = existing.quantity ?? 0
    const newQuantity = Math.max(oldQuantity + quantityDelta, 0)
    let newCostBasis = existing.costBasis ?? 0
    if (quantityDelta > 0) {
      newCostBasis = newCostBasis + (costBasis ?? 0)
    } else if (newQuantity > 0 && oldQuantity > 0) {
      newCostBasis = newCostBasis * (newQuantity / oldQuantity)
    } else {
      newCostBasis = 0
    }
    await db
      .update(schema.holdings)
      .set({ quantity: newQuantity, costBasis: newCostBasis, updatedAt: now })
      .where(eq(schema.holdings.id, existing.id))
    return existing.id
  }
  const id = uid('hol')
  await db.insert(schema.holdings).values({
    id,
    accountId,
    securityId,
    quantity: Math.max(quantityDelta, 0),
    costBasis: quantityDelta > 0 ? costBasis : null,
    updatedAt: now,
  })
  return id
}

const INVESTMENT_ACTIONS = new Set([
  'Buy',
  'Sell',
  'ShrsIn',
  'ShrsOut',
  'StkSplit',
  'Div',
  'DivX',
  'IntExp',
  'ReinvDiv',
  'ReinvInt',
  'MarginInt',
  'MiscExp',
  'MiscInc',
  'CGLong',
  'CGLongX',
  'CGShort',
  'CGShortX',
  'Transfer',
])

export async function importQif(input: ImportQifInput): Promise<ImportQifResult> {
  const db = getDb()
  const parsed = parseQif(input.content)

  const targetSection = parsed.sections[0]
  if (!targetSection) {
    throw new Error('No QIF data sections found in the file.')
  }

  const isInvestment = targetSection.type.toUpperCase().startsWith('INVST')
  const account = await resolveAccount(input.userId, input, targetSection.type, parsed.accounts)

  let transactionsImported = 0
  let holdingsChanged = 0
  const seenKeys = new Set<string>()

  for (const section of parsed.sections) {
    const sectionIsInvestment = section.type.toUpperCase().startsWith('INVST')
    if (sectionIsInvestment && !isInvestment) continue
    if (!sectionIsInvestment && isInvestment) continue
    if (section.type.toUpperCase() === 'CAT' || section.type.toUpperCase() === 'CLASS') continue

    for (const record of section.records) {
      const date = parseQifDate(record.fields['D'] ?? '')
      const memo = record.fields['M']?.trim() || null
      const payee = record.fields['P']?.trim() || null
      const category = record.fields['L']?.trim() || null
      const amount = parseQifAmount(record.fields['T'] ?? '0')

      if (!date) continue

      if (sectionIsInvestment) {
        const action = (record.fields['N'] ?? '').trim()
        const securityName = record.fields['Y']?.trim() || null
        const ticker = record.fields['L']?.trim() || null
        const quantity = parseQifAmount(record.fields['Q'] ?? '0')

        if (securityName && !INVESTMENT_ACTIONS.has(action) && quantity === 0) {
          await findOrCreateSecurity(ticker, securityName)
          continue
        }

        const securityId = securityName
          ? await findOrCreateSecurity(ticker, securityName)
          : null

        if (securityId && ['Buy', 'Sell', 'ShrsIn', 'ShrsOut', 'ReinvDiv', 'ReinvInt', 'StkSplit'].includes(action)) {
          let delta = quantity
          if (action === 'Sell' || action === 'ShrsOut' || action === 'CGLong' || action === 'CGShort') {
            delta = -quantity
          }
          const costBasis = amount > 0 && quantity > 0 ? amount : null
          await adjustHolding(account.id, securityId, delta, costBasis)
          holdingsChanged++
        }

        const key = `${date}|${action}|${securityName ?? ''}|${amount}`
        if (seenKeys.has(key)) continue
        seenKeys.add(key)

        await db.insert(schema.transactions).values({
          id: uid('txn'),
          userId: input.userId,
          accountId: account.id,
          source: 'qif',
          amount,
          name: securityName ? `${action} ${securityName}` : `${action} ${memo ?? ''}`.trim(),
          merchantName: null,
          category: JSON.stringify(['Investments', action]),
          date,
          notes: memo ?? undefined,
        })
        transactionsImported++
        continue
      }

      if (record.splits.length > 0) {
        for (const split of record.splits) {
          if (split.amount == null || split.amount === 0) continue
          const sign = sectionIsExpenseAccount(section.type) ? 1 : -1
          await insertTransaction({
            userId: input.userId,
            accountId: account.id,
            date,
            amount: split.amount * sign,
            name: payee ?? memo ?? 'Split transaction',
            merchantName: payee,
            category: split.category ?? category,
            notes: [memo, split.memo].filter(Boolean).join(' — ') || undefined,
          })
          transactionsImported++
        }
        continue
      }

      const sign = sectionIsExpenseAccount(section.type) ? 1 : -1
      await insertTransaction({
        userId: input.userId,
        accountId: account.id,
        date,
        amount: amount * sign,
        name: payee ?? memo ?? 'Untitled transaction',
        merchantName: payee,
        category: category,
        notes: memo ?? undefined,
      })
      transactionsImported++
    }
  }

  return {
    accountsCreated: [{ id: account.id, name: account.name, type: account.type }],
    accountUsed: account,
    transactionsImported,
    holdingsChanged,
    sectionsFound: parsed.sections.map((s) => s.type),
  }
}

function sectionIsExpenseAccount(qifType: string): boolean {
  const t = qifType.toUpperCase()
  return t === 'CCARD'
}

async function insertTransaction(input: {
  userId: string
  accountId: string
  date: string
  amount: number
  name: string
  merchantName?: string | null
  category?: string | null
  notes?: string
}) {
  const db = getDb()
  await db.insert(schema.transactions).values({
    id: uid('txn'),
    userId: input.userId,
    accountId: input.accountId,
    source: 'qif',
    amount: input.amount,
    name: input.name,
    merchantName: input.merchantName ?? null,
    category: input.category ? JSON.stringify([input.category]) : null,
    date: input.date,
    notes: input.notes,
  })
}
