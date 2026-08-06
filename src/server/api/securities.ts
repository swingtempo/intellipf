import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { ensureUserScoped } from '../user'
import { getDb, schema } from '../db'
import { fetchYahooPrices } from '../services/prices'
import { getAssetAllocation } from '../services/allocations'
import { safeJsonParse } from '#/lib/utils'

export interface SecurityPricePoint {
  date: string
  price: number
}

export interface AssetAllocation {
  assetClass: string
  weight: number
}

export interface SecurityDetail {
  ticker: string
  name?: string
  type?: string
  currency?: string
  sector?: string
  industry?: string
  latestPrice?: number
  priceHistory: SecurityPricePoint[]
  allocations?: Array<AssetAllocation & { source: 'user_defined' | 'api_provider' }>
}

export const getSecurityDetail = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      ticker: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    await ensureUserScoped()
    const db = getDb()
    const ticker = data.ticker.toUpperCase()

    const userId = (await ensureUserScoped()) ?? ''

    let security = await db
      .select()
      .from(schema.securities)
      .where(eq(schema.securities.ticker, ticker))
      .limit(1)

    const priceRows = await db
      .select({ date: schema.stockPrices.date, price: schema.stockPrices.price })
      .from(schema.stockPrices)
      .where(eq(schema.stockPrices.ticker, ticker))
      .orderBy(schema.stockPrices.date)

    let latestPrice: number | undefined
    if (priceRows.length > 0) {
      latestPrice = priceRows[priceRows.length - 1]!.price
    }

    if (!security || security.length === 0) {
      const result = await fetchYahooPrices([ticker])
      const tickerData = result.get(ticker)
      if (tickerData && tickerData.metadata) {
        await db
          .insert(schema.securities)
          .values({
            id: crypto.randomUUID(),
            ticker,
            name: tickerData.metadata.name,
            type: tickerData.metadata.type ?? 'other',
            currency: tickerData.metadata.currency ?? 'USD',
            sector: tickerData.metadata.sector,
            industry: tickerData.metadata.industry,
          })
          .onConflictDoUpdate({
            target: schema.securities.ticker,
            set: {
              name: schema.securities.name,
              type: schema.securities.type,
              currency: schema.securities.currency,
              sector: schema.securities.sector,
              industry: schema.securities.industry,
            },
          })
        security = await db
          .select()
          .from(schema.securities)
          .where(eq(schema.securities.ticker, ticker))
          .limit(1)
      }
    }

    // Fetch user-defined allocation from DB
    const allocRow = await db
      .select()
      .from(schema.securityAllocations)
      .where(and(eq(schema.securityAllocations.ticker, ticker), eq(schema.securityAllocations.userId, userId)))
      .limit(1)
    let allocations: SecurityDetail['allocations'] = undefined
    if (allocRow.length > 0) {
      const parsed = safeJsonParse<AssetAllocation[]>(allocRow[0].allocations, [])
      if (parsed.length > 0) {
        allocations = parsed.map((a) => ({ ...a, source: 'user_defined' as const }))
      }
    }

    // Fall back to provider-based allocation when no user-defined one exists
    if (!allocations || allocations.length === 0) {
      const providerAllocs = await getAssetAllocation(ticker)
      if (providerAllocs && providerAllocs.length > 0) {
        allocations = providerAllocs.map((a) => ({ ...a, source: 'api_provider' as const }))
      }
    }

    return {
      ticker,
      name: security?.[0]?.name,
      type: security?.[0]?.type,
      currency: security?.[0]?.currency ?? 'USD',
      sector: security?.[0]?.sector,
      industry: security?.[0]?.industry,
      latestPrice,
      priceHistory: priceRows.map((r) => ({ date: r.date, price: r.price })),
      allocations,
    } as SecurityDetail
  })
