import { and, eq } from 'drizzle-orm'
import { safeJsonParse } from '#/lib/utils'
import { getEnv } from '#/lib/env'
import { getDb, schema } from '../db'
import { getPrice } from './prices'

export type AssetClass =
  | 'Equity'
  | 'Fixed Income'
  | 'Cash & Equivalents'
  | 'Real Estate'
  | 'Commodities'
  | 'Alternative'
  | 'Other'

export interface AssetAllocation {
  assetClass: AssetClass
  weight: number
  detail?: string
}

export interface AllocationProvider {
  name: string
  getAssetAllocation(ticker: string): Promise<AssetAllocation[] | null>
}

const EQUITY = ['QQQ', 'SPY', 'VTI', 'VOO', 'IVV', 'VXUS', 'EEM', 'IWM', 'SCHB', 'SCHX', 'VEA', 'VT']
const FIXED_INCOME = ['BND', 'AGG', 'TLT', 'IEI', 'SHY', 'LQD', 'HYG', 'MUB', 'GOVT', 'VGSH', 'VGIT', 'VGLT', 'BSV', 'BIV', 'BLV', 'VCIT', 'VCSH', 'BNDX', 'IEF', 'TLH']
const COMMODITIES = ['GLD', 'SLV', 'USO', 'DBA', 'PDBC', 'COMT', 'IAU', 'GLDM', 'SLV']
const REAL_ESTATE = ['VNQ', 'VNQI', 'IYR', 'XLRE', 'SCHH', 'REM', 'O']
const CASH = ['BIL', 'SHV', 'MINT', 'SMMT', 'FZFXX', 'SPRXX']
const ALTERNATIVE = ['BTC', 'ETH', 'GBTC', 'BITO', 'EETH', 'IAU']

export function classifyTicker(ticker: string): AssetClass {
  const t = ticker.toUpperCase().trim()
  if (!t) return 'Other'
  if (FIXED_INCOME.includes(t)) return 'Fixed Income'
  if (COMMODITIES.includes(t)) return 'Commodities'
  if (REAL_ESTATE.includes(t)) return 'Real Estate'
  if (CASH.includes(t)) return 'Cash & Equivalents'
  if (ALTERNATIVE.includes(t)) return 'Alternative'
  if (EQUITY.includes(t)) return 'Equity'
  if (t.endsWith('X') || t.length <= 5) return 'Equity'
  return 'Other'
}

export const simulatedAllocationProvider: AllocationProvider = {
  name: 'simulated',
  async getAssetAllocation(ticker) {
    return [{ assetClass: classifyTicker(ticker), weight: 1 }]
  },
}

export const alphaVantageAllocationProvider: AllocationProvider = {
  name: 'alpha_vantage',
  async getAssetAllocation(ticker) {
    const key = getEnv('ALPHA_VANTAGE_API_KEY')
    if (!key) return null
    try {
      const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
      if (!res.ok) return null
      const data = (await res.json()) as {
        AssetType?: string
        Sector?: string
        Name?: string
      }
      if (!data || typeof data !== 'object' || !data.AssetType) return null
      const assetType = (data.AssetType ?? '').toLowerCase()
      const sector = (data.Sector ?? '').toLowerCase()
      let assetClass: AssetClass
      if (assetType.includes('etf') || assetType.includes('mutual fund') || assetType.includes('common stock')) {
        assetClass = sector.includes('real estate') ? 'Real Estate' : 'Equity'
      } else if (assetType.includes('bond') || assetType.includes('fixed')) {
        assetClass = 'Fixed Income'
      } else if (assetType.includes('preferred')) {
        assetClass = 'Fixed Income'
      } else if (assetType.includes('depositary receipt')) {
        assetClass = 'Equity'
      } else {
        assetClass = 'Other'
      }
      return [{ assetClass, weight: 1, detail: sector || data.Name }]
    } catch {
      return null
    }
  },
}

export const stratamoreAllocationProvider: AllocationProvider = {
  name: 'stratamore',
  async getAssetAllocation(ticker) {
    const key = getEnv('STRATAMORE_API_KEY')
    const baseUrl = getEnv('STRATAMORE_BASE_URL') ?? 'https://api.stratamore.com'
    if (!key) return null
    try {
      const url = `${baseUrl}/v1/asset-allocation?ticker=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) return null
      const body = (await res.json()) as unknown
      const allocations = (body as { allocations?: Array<{ asset_class: string; weight: number }> })?.allocations
      if (Array.isArray(allocations)) {
        return allocations
          .map((a) => ({
            assetClass: normalizeAssetClass(a.asset_class),
            weight: a.weight,
          }))
          .filter((a) => a.weight > 0)
      }
      const single = body as { asset_class?: string; weight?: number }
      if (typeof body === 'object' && body !== null && single.asset_class) {
        return [
          {
            assetClass: normalizeAssetClass(single.asset_class),
            weight: single.weight ?? 1,
          },
        ]
      }
      return null
    } catch {
      return null
    }
  },
}

function normalizeAssetClass(raw: string): AssetClass {
  const value = raw.toLowerCase()
  if (value.includes('equit') || value.includes('stock')) return 'Equity'
  if (value.includes('fixed') || value.includes('bond') || value.includes('debt')) return 'Fixed Income'
  if (value.includes('cash')) return 'Cash & Equivalents'
  if (value.includes('real estate') || value.includes('reit')) return 'Real Estate'
  if (value.includes('commod') || value.includes('gold')) return 'Commodities'
  if (value.includes('alternative') || value.includes('crypto')) return 'Alternative'
  return 'Other'
}

export async function getAssetAllocation(
  ticker: string,
  userId?: string,
): Promise<AssetAllocation[] | null> {
  if (userId) {
    const db = getDb()
    const row = await db
      .select()
      .from(schema.securityAllocations)
      .where(and(eq(schema.securityAllocations.ticker, ticker.toUpperCase()), eq(schema.securityAllocations.userId, userId)))
      .limit(1)
    if (row.length > 0) {
      const parsed = safeJsonParse<AssetAllocation[]>(row[0].allocations, [])
      if (parsed.length > 0) return parsed
    }
  }

  const alpha = getEnv('ALPHA_VANTAGE_API_KEY') ? alphaVantageAllocationProvider : null
  if (alpha) {
    const result = await alpha.getAssetAllocation(ticker)
    if (result) return result
  }
  const strat = getEnv('STRATAMORE_API_KEY') ? stratamoreAllocationProvider : null
  if (strat) {
    const result = await strat.getAssetAllocation(ticker)
    if (result) return result
  }
  return simulatedAllocationProvider.getAssetAllocation(ticker)
}

export async function getUserAllocations(userId: string): Promise<Array<{ ticker: string; allocations: AssetAllocation[] }>> {
  const db = getDb()
  const rows = await db
    .select({
      ticker: schema.securityAllocations.ticker,
      allocations: schema.securityAllocations.allocations,
    })
    .from(schema.securityAllocations)
    .where(eq(schema.securityAllocations.userId, userId))

  return rows.map((row) => ({
    ticker: row.ticker,
    allocations: safeJsonParse<AssetAllocation[]>(row.allocations, []),
  })).filter((item) => item.allocations.length > 0)
}

export async function saveUserAllocation(
  userId: string,
  ticker: string,
  allocations: AssetAllocation[],
): Promise<void> {
  const db = getDb()
  await db
    .insert(schema.securityAllocations)
    .values({
      id: crypto.randomUUID(),
      userId,
      ticker: ticker.toUpperCase().trim(),
      allocations: JSON.stringify(allocations),
    })
    .onConflictDoUpdate({
      target: [schema.securityAllocations.userId, schema.securityAllocations.ticker],
      set: { allocations: JSON.stringify(allocations) },
    })
}

export async function deleteUserAllocation(userId: string, ticker: string): Promise<void> {
  const db = getDb()
  await db
    .delete(schema.securityAllocations)
    .where(and(eq(schema.securityAllocations.userId, userId), eq(schema.securityAllocations.ticker, ticker.toUpperCase().trim())))
}

export async function syncAssetAllocations(userId: string, tickers: string[]): Promise<number> {
  const synced = new Set<string>()
  for (const ticker of tickers) {
    const upper = ticker.toUpperCase().trim()
    if (!upper || synced.has(upper)) continue
    const result = await getAssetAllocation(ticker, userId)
    if (result && result.length > 0) {
      await saveUserAllocation(userId, upper, result)
      synced.add(upper)
    }
  }
  return synced.size
}

export interface PortfolioAllocationEntry {
  securityId: string
  ticker: string
  name: string | null
  type: string
  quantity: number
  price: number | null
  marketValue: number
  allocations: AssetAllocation[]
}

export interface PortfolioAllocationResult {
  entries: PortfolioAllocationEntry[]
  totalValue: number
  assetClasses: Array<{ assetClass: AssetClass; value: number; weight: number }>
  source: 'user_defined' | 'allocation_provider' | 'fallback'
}

export async function computePortfolioAllocation(
  entries: Array<{
    securityId: string
    ticker: string | null
    name: string | null
    type: string
    quantity: number
    price: number | null
  }>,
  userId?: string,
): Promise<PortfolioAllocationResult> {
  const withValue: PortfolioAllocationEntry[] = []
  let totalValue = 0

  for (const entry of entries) {
    let price = entry.price
    if (price == null && entry.ticker) {
      const quote = await getPrice(entry.ticker)
      price = quote?.price ?? null
    }
    const marketValue = price != null ? price * entry.quantity : 0
    totalValue += marketValue

    let allocations: AssetAllocation[] = []

    if (entry.ticker) {
      const result = await getAssetAllocation(entry.ticker, userId)
      if (result) {
        allocations = result
      }
    }

    if (allocations.length === 0) {
      allocations = [{ assetClass: classifyTicker(entry.ticker ?? ''), weight: 1 }]
    }

    withValue.push({
      securityId: entry.securityId,
      ticker: entry.ticker ?? '',
      name: entry.name,
      type: entry.type,
      quantity: entry.quantity,
      price,
      marketValue,
      allocations,
    })
  }

  const classTotals = new Map<AssetClass, number>()
  for (const entry of withValue) {
    for (const allocation of entry.allocations) {
      const value = entry.marketValue * allocation.weight
      classTotals.set(allocation.assetClass, (classTotals.get(allocation.assetClass) ?? 0) + value)
    }
  }

  const assetClasses = Array.from(classTotals.entries())
    .map(([assetClass, value]) => ({
      assetClass,
      value,
      weight: totalValue > 0 ? value / totalValue : 0,
    }))
    .sort((a, b) => b.value - a.value)

  return {
    entries: withValue,
    totalValue,
    assetClasses,
    source: 'allocation_provider',
  }
}
