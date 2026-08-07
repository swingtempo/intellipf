import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { safeJsonParse } from '#/lib/utils'
import { getDb, schema } from '../db'
import { computePortfolioAllocation } from './allocations'

export interface AccountWithBalance {
  id: string
  name: string
  officialName: string | null
  type: string
  subtype: string | null
  mask: string | null
  institutionName: string | null
  source: string
  isActive: boolean
  plaidItemId: string | null
  balance: number | null
  available: number | null
  limit: number | null
  currency: string
}

export async function getAccountsWithBalance(userId: string) {
  const db = getDb()
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.isActive, true)))
    .orderBy(asc(schema.accounts.name))

  if (accounts.length === 0) return []

  const balances = await db
    .select()
    .from(schema.balances)
    .where(
      and(
        eq(schema.balances.userId, userId),
        inArray(
          schema.balances.accountId,
          accounts.map((a) => a.id),
        ),
      ),
    )
    .orderBy(asc(schema.balances.date))

  const latestByAccount = new Map<string, (typeof balances)[number]>()
  for (const balance of balances) {
    latestByAccount.set(balance.accountId, balance)
  }

  return accounts.map<AccountWithBalance>((account) => {
    const latest = latestByAccount.get(account.id)
    return {
      id: account.id,
      name: account.name,
      officialName: account.officialName,
      type: account.type,
      subtype: account.subtype,
      mask: account.mask,
      institutionName: account.institutionName,
      source: account.source,
      isActive: account.isActive,
      plaidItemId: account.plaidItemId,
      balance: latest?.current ?? latest?.available ?? null,
      available: latest?.available ?? null,
      limit: latest?.limit ?? null,
      currency: account.currencyCode,
    }
  })
}

export interface TransactionRow {
  id: string
  accountId: string
  accountName: string
  amount: number
  name: string
  merchantName: string | null
  category: string[]
  date: string
  currency: string
  pending: boolean
  notes: string | null
  source: string
}

export interface TransactionFilters {
  accountId?: string
  from?: string
  to?: string
  search?: string
  category?: string
  source?: string
  limit?: number
  offset?: number
}

export async function getTransactions(
  userId: string,
  filters: TransactionFilters = {},
): Promise<{ rows: TransactionRow[]; total: number }> {
  const db = getDb()
  const conditions = [eq(schema.transactions.userId, userId)]
  if (filters.accountId) conditions.push(eq(schema.transactions.accountId, filters.accountId))
  if (filters.from) conditions.push(gte(schema.transactions.date, filters.from))
  if (filters.to) conditions.push(lte(schema.transactions.date, filters.to))
  if (filters.search) {
    conditions.push(
      sql`(${schema.transactions.name} LIKE ${`%${filters.search}%`} OR ${schema.transactions.merchantName} LIKE ${`%${filters.search}%`} OR ${schema.transactions.notes} LIKE ${`%${filters.search}%`})`,
    )
  }
  if (filters.category) {
    conditions.push(sql`${schema.transactions.category} LIKE ${`%${filters.category}%`}`)
  }
  if (filters.source) conditions.push(eq(schema.transactions.source, filters.source as 'plaid'))

  const where = and(...conditions)
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.transactions)
    .where(where)

  const limit = Math.min(filters.limit ?? 100, 500)
  const rows = await db
    .select({
      id: schema.transactions.id,
      accountId: schema.transactions.accountId,
      accountName: schema.accounts.name,
      amount: schema.transactions.amount,
      name: schema.transactions.name,
      merchantName: schema.transactions.merchantName,
      category: schema.transactions.category,
      date: schema.transactions.date,
      currency: schema.transactions.currencyCode,
      pending: schema.transactions.pending,
      notes: schema.transactions.notes,
      source: schema.transactions.source,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
    .where(where)
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.createdAt))
    .limit(limit)
    .offset(filters.offset ?? 0)

  return {
    rows: rows.map((row) => ({
      ...row,
      accountName: row.accountName ?? '',
      category: safeJsonParse<string[]>(row.category, []),
    })),
    total: Number(count),
  }
}

export async function getDistinctCategories(userId: string): Promise<string[]> {
  const db = getDb()
  const rows = await db
    .select({ category: schema.transactions.category })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), isNotNull(schema.transactions.category)))
    .limit(10_000)
  const categories = new Set<string>()
  for (const row of rows) {
    if (!row.category) continue
    const parsed = safeJsonParse<string[]>(row.category, [])
    if (Array.isArray(parsed)) {
      for (const cat of parsed) {
        if (typeof cat === 'string' && cat) categories.add(cat)
      }
    }
  }
  return Array.from(categories).sort()
}

export async function getNetWorthSeries(
  userId: string,
  months = 36,
): Promise<
  Array<{ date: string; assets: number; liabilities: number; netWorth: number }>
> {
  const db = getDb()
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.isActive, true)))

  const isLiability = (type: string) => type === 'credit' || type === 'loan'
  const accountsById = new Map(accounts.map((a) => [a.id, a]))

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffKey = cutoff.toISOString().slice(0, 10)

  const balances = await db
    .select()
    .from(schema.balances)
    .where(
      and(
        eq(schema.balances.userId, userId),
        gte(schema.balances.date, cutoffKey),
      ),
    )
    .orderBy(asc(schema.balances.date))

  const snapshotsByAccount = new Map<string, Array<{ date: string; value: number }>>()
  for (const account of accounts) {
    snapshotsByAccount.set(account.id, [])
  }

  for (const balance of balances) {
    if (!snapshotsByAccount.has(balance.accountId)) continue
    const value = balance.current ?? balance.available ?? 0
    if (value === 0) continue
    snapshotsByAccount.get(balance.accountId)!.push({ date: balance.date, value })
  }
  for (const list of snapshotsByAccount.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : 1))
  }

  const allDates = new Set<string>()
  for (const list of snapshotsByAccount.values()) {
    for (const item of list) allDates.add(item.date)
  }
  const dates = Array.from(allDates).sort()

  const holdingsValue = await getHoldingsMarketValue(userId)
  const today = new Date().toISOString().slice(0, 10)

  const points: Array<{ date: string; assets: number; liabilities: number; netWorth: number }> = []
  const pointers = new Map<string, number>()

  for (const date of dates) {
    let assets = 0
    let liabilities = 0
    for (const [accountId, list] of snapshotsByAccount) {
      let pointer = pointers.get(accountId) ?? 0
      while (pointer < list.length && list[pointer]!.date <= date) pointer++
      pointers.set(accountId, pointer)
      if (pointer === 0) continue
      const value = list[pointer - 1]!.value
      if (isLiability(accountsById.get(accountId)?.type ?? 'other')) liabilities += value
      else assets += value
    }
    if (date >= today) assets += holdingsValue
    points.push({
      date,
      assets,
      liabilities,
      netWorth: assets - liabilities,
    })
  }

  if (points.length === 0 || points[points.length - 1]!.date < today) {
    const totalAssets = Array.from(snapshotsByAccount.entries()).reduce((sum, [accountId, list]) => {
      if (isLiability(accountsById.get(accountId)?.type ?? 'other')) return sum
      return sum + (list[list.length - 1]?.value ?? 0)
    }, 0)
    const totalLiabilities = Array.from(snapshotsByAccount.entries()).reduce((sum, [accountId, list]) => {
      if (!isLiability(accountsById.get(accountId)?.type ?? 'other')) return sum
      return sum + (list[list.length - 1]?.value ?? 0)
    }, 0)
    points.push({
      date: today,
      assets: totalAssets + holdingsValue,
      liabilities: totalLiabilities,
      netWorth: totalAssets + holdingsValue - totalLiabilities,
    })
  }

  return points
}

export async function getHoldingsMarketValue(userId: string): Promise<number> {
  const db = getDb()
  const accountIds = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.isActive, true)))
  if (accountIds.length === 0) return 0
  const holdings = await db
    .select({
      quantity: schema.holdings.quantity,
      price: schema.holdings.price,
    })
    .from(schema.holdings)
    .where(
      inArray(
        schema.holdings.accountId,
        accountIds.map((a) => a.id),
      ),
    )
  return holdings.reduce(
    (sum, holding) => sum + (holding.price ?? 0) * (holding.quantity ?? 0),
    0,
  )
}

export interface BudgetWithSpending {
  id: string
  category: string
  month: string
  amount: number
  spent: number
  remaining: number
  progress: number
}

export async function getBudgetsWithSpending(
  userId: string,
  month: string,
): Promise<{ budgets: BudgetWithSpending[]; unbudgeted: Array<{ category: string; spent: number }> }> {
  const db = getDb()
  const budgets = await db
    .select()
    .from(schema.budgets)
    .where(and(eq(schema.budgets.userId, userId), eq(schema.budgets.month, month)))

  const spending = await getSpendingByCategory(userId, `${month}-01`, `${month}-31`)

  const result: BudgetWithSpending[] = budgets.map((budget) => {
    const spent = spending.get(budget.category) ?? 0
    return {
      id: budget.id,
      category: budget.category,
      month: budget.month,
      amount: budget.amount,
      spent,
      remaining: budget.amount - spent,
      progress: budget.amount > 0 ? spent / budget.amount : 0,
    }
  })

  const budgeted = new Set(budgets.map((b) => b.category))
  const unbudgeted = Array.from(spending.entries())
    .filter(([category]) => !budgeted.has(category))
    .map(([category, spent]) => ({ category, spent }))
    .sort((a, b) => b.spent - a.spent)

  return { budgets: result, unbudgeted }
}

export async function getSpendingByCategory(
  userId: string,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const db = getDb()
  const rows = await db
    .select({
      category: schema.transactions.category,
      amount: schema.transactions.amount,
    })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.userId, userId),
        gte(schema.transactions.date, from),
        lte(schema.transactions.date, to),
        sql`${schema.transactions.amount} > 0`,
      ),
    )
    .limit(100_000)

  const spending = new Map<string, number>()
  for (const row of rows) {
    const categories = safeJsonParse<string[]>(row.category, [])
    const category = Array.isArray(categories) && typeof categories[0] === 'string' ? categories[0] : 'Uncategorized'
    spending.set(category, (spending.get(category) ?? 0) + row.amount)
  }
  return spending
}

export interface PortfolioHolding {
  accountId: string
  accountName: string
  securityId: string
  ticker: string
  name: string | null
  type: string
  quantity: number
  price: number | null
  marketValue: number
  costBasis: number | null
  gain: number | null
  gainPercent: number | null
  priceSource: 'yahoo_finance' | 'simulated' | null
}

export interface PriceSourceBreakdown {
  yahoo_finance: number
  simulated: number
}

export interface PortfolioData {
  holdings: PortfolioHolding[]
  totalValue: number
  totalCost: number
  allocations: Awaited<ReturnType<typeof computePortfolioAllocation>>
  allocationsUpdatedAt: string | null
  priceLastSyncedAt: string | null
  priceSourceBreakdown: PriceSourceBreakdown | null
}

export async function getPortfolio(userId: string): Promise<PortfolioData> {
  const db = getDb()
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.userId, userId),
        eq(schema.accounts.isActive, true),
        inArray(schema.accounts.type, ['brokerage', 'investment']),
      ),
    )
  if (accounts.length === 0) {
    return {
      holdings: [],
      totalValue: 0,
      totalCost: 0,
      allocations: { entries: [], totalValue: 0, assetClasses: [], source: 'allocation_provider' },
      allocationsUpdatedAt: null,
      priceLastSyncedAt: null,
      priceSourceBreakdown: null,
    }
  }

  const accountIds = accounts.map((a) => a.id)
  const holdingsRows = await db
    .select()
    .from(schema.holdings)
    .where(inArray(schema.holdings.accountId, accountIds))
  const securities = await db
    .select()
    .from(schema.securities)
    .where(inArray(schema.securities.id, holdingsRows.map((h) => h.securityId)))

  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const securityById = new Map(securities.map((s) => [s.id, s]))

  // Build a map of ticker → latest stock price date for source tracking
  const latestPrices = await db
    .select({ ticker: schema.stockPrices.ticker, date: schema.stockPrices.date })
    .from(schema.stockPrices)
    .where(inArray(schema.stockPrices.ticker, [...new Set(holdingsRows.map((h) => securityById.get(h.securityId)?.ticker ?? '').filter(Boolean))]))
    .orderBy(desc(schema.stockPrices.date))

  const priceDateByTicker = new Map<string, string>()
  for (const row of latestPrices) {
    if (!priceDateByTicker.has(row.ticker)) {
      priceDateByTicker.set(row.ticker, row.date)
    }
  }

  const holdings: PortfolioHolding[] = holdingsRows.map((holding) => {
    const security = securityById.get(holding.securityId)
    const price = holding.price ?? null
    const marketValue = price != null ? price * holding.quantity : 0
    const costBasis = holding.costBasis ?? null
    const gain = costBasis != null ? marketValue - costBasis : null
    const gainPercent = gain != null && costBasis != null && costBasis > 0 ? gain / costBasis : null
    const account = accountById.get(holding.accountId)
    const ticker = security?.ticker
    return {
      accountId: holding.accountId,
      accountName: account?.name ?? '',
      securityId: holding.securityId,
      ticker: ticker ?? '',
      name: security?.name ?? null,
      type: security?.type ?? 'other',
      quantity: holding.quantity,
      price,
      marketValue,
      costBasis,
      gain,
      gainPercent,
      priceSource: ticker ? (priceDateByTicker.has(ticker) ? 'yahoo_finance' : null) : null,
    }
  })

  const [allocResult, allocMeta, priceMeta] = await Promise.all([
    computePortfolioAllocation(
      holdingsRows.map((holding) => {
        const security = securityById.get(holding.securityId)
        return {
          securityId: holding.securityId,
          ticker: security?.ticker ?? null,
          name: security?.name ?? null,
          type: security?.type ?? 'other',
          quantity: holding.quantity,
          price: holding.price,
        }
      }),
      userId,
    ),
    db
      .select({ updatedAt: schema.securityAllocations.updatedAt })
      .from(schema.securityAllocations)
      .where(eq(schema.securityAllocations.userId, userId))
      .orderBy(desc(schema.securityAllocations.updatedAt))
      .limit(1),
    db
      .select({ date: schema.stockPrices.date })
      .from(schema.stockPrices)
      .where(inArray(schema.stockPrices.ticker, [...new Set(holdingsRows.map((h) => securityById.get(h.securityId)?.ticker ?? '').filter(Boolean))]))
      .orderBy(desc(schema.stockPrices.date))
      .limit(1),
  ])

  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0)
  const totalCost = holdings.reduce((sum, h) => sum + (h.costBasis ?? 0), 0)

  const allTickers = new Set(holdings.map((h) => h.ticker).filter(Boolean))
  const yahooTickerCount = [...allTickers].filter((t) => t && priceDateByTicker.has(t)).length
  const simulatedTickerCount = allTickers.size - yahooTickerCount

  return {
    holdings,
    totalValue,
    totalCost,
    allocations: allocResult,
    allocationsUpdatedAt: allocMeta[0]?.updatedAt ?? null,
    priceLastSyncedAt: priceMeta[0]?.date ?? null,
    priceSourceBreakdown: yahooTickerCount > 0 ? { yahoo_finance: yahooTickerCount, simulated: simulatedTickerCount } : null,
  }
}

export interface DashboardData {
  accounts: AccountWithBalance[]
  totalCash: number
  totalDebt: number
  investmentValue: number
  netWorth: number
  netWorthSeries: Awaited<ReturnType<typeof getNetWorthSeries>>
  recentTransactions: TransactionRow[]
  monthlySpending: number
  monthlyIncome: number
  budgets: BudgetWithSpending[]
  goals: Array<typeof schema.goals.$inferSelect>
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const db = getDb()
  const [accounts, series, transactions, budgets] = await Promise.all([
    getAccountsWithBalance(userId),
    getNetWorthSeries(userId, 36),
    getTransactions(userId, { limit: 10 }),
    getBudgetsWithSpending(userId, new Date().toISOString().slice(0, 7)),
  ])

  const investmentAccounts = accounts.filter((a) => a.type === 'brokerage' || a.type === 'investment')
  const cashAccounts = accounts.filter((a) => a.type === 'depository')
  const debtAccounts = accounts.filter((a) => a.type === 'credit' || a.type === 'loan')

  const totalCash = cashAccounts.reduce((sum, a) => sum + (a.balance ?? 0), 0)
  const totalDebt = debtAccounts.reduce((sum, a) => sum + Math.abs(a.balance ?? 0), 0)
  const investmentValue = await getHoldingsMarketValue(userId)
  const cashInInvestment = investmentAccounts.reduce((sum, a) => sum + (a.balance ?? 0), 0)
  const totalAssets = totalCash + investmentValue + cashInInvestment

  const currentMonth = new Date().toISOString().slice(0, 7)
  const monthStart = `${currentMonth}-01`
  const monthEnd = `${currentMonth}-31`
  const monthRows = await db
    .select({ amount: schema.transactions.amount })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.userId, userId),
        gte(schema.transactions.date, monthStart),
        lte(schema.transactions.date, monthEnd),
      ),
    )
  const monthlySpending = monthRows.reduce((sum, t) => sum + Math.max(t.amount, 0), 0)
  const monthlyIncome = monthRows.reduce((sum, t) => sum + Math.max(-t.amount, 0), 0)

  const goals = await db
    .select()
    .from(schema.goals)
    .where(eq(schema.goals.userId, userId))
    .orderBy(asc(schema.goals.createdAt))

  return {
    accounts,
    totalCash,
    totalDebt,
    investmentValue,
    netWorth: totalAssets - totalDebt,
    netWorthSeries: series,
    recentTransactions: transactions.rows,
    monthlySpending,
    monthlyIncome,
    budgets: budgets.budgets,
    goals,
  }
}
