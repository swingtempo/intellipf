import { desc, eq, inArray, sql } from 'drizzle-orm'
import { getDb, schema } from '../db'

interface YahooTimestampResult {
  open: number[] | null
  high: number[] | null
  low: number[] | null
  close: number[] | null
  volume: number[] | null
}

interface YahooChartResult {
  meta: {
    regularMarketPrice?: number
    chartPreviousClose?: number
    symbol: string
  }
  timestamp: number[] | null
  indicators: {
    quote: YahooTimestampResult[]
  }
}

interface YahooQuoteResponse {
  quoteResponse: {
    result: Array<{
      symbol: string
      shortName?: string
      longName?: string
      quoteType?: string
      sector?: string
      industry?: string
      currency?: string
    }>
    error?: unknown
  }
}

interface YahooPriceData {
  prices: Map<string, number>
  metadata?: {
    name?: string
    type?: string
    sector?: string
    industry?: string
    currency?: string
  }
}

export async function fetchYahooPrices(tickers: string[]): Promise<Map<string, YahooPriceData>> {
  const results = new Map<string, YahooPriceData>()

  for (const ticker of tickers) {
    try {
      const [chartResp, quoteResp] = await Promise.all([
        fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=30d&interval=1d`,
          { headers: { 'User-Agent': 'IntelliPF/1.0' } },
        ),
        fetch(
          `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}`,
          { headers: { 'User-Agent': 'IntelliPF/1.0' } },
        ),
      ])

      const pricesMap = new Map<string, number>()
      let metadata: YahooPriceData['metadata'] = undefined

      if (chartResp.ok) {
        const json = (await chartResp.json()) as { chart?: { result: YahooChartResult[]; error?: unknown } }
        const chart = json?.chart?.result?.[0]
        if (chart) {
          const timestamps = chart.timestamp
          const closes = chart.indicators?.quote?.[0]?.close
          if (timestamps && closes) {
            for (let i = 0; i < timestamps.length; i++) {
              const close = closes[i]
              if (close == null) continue
              const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10)
              pricesMap.set(date, Number(close))
            }
          }
        }
      }

      if (quoteResp.ok) {
        const json = (await quoteResp.json()) as YahooQuoteResponse
        const item = json?.quoteResponse?.result?.[0]
        if (item) {
          metadata = {
            name: item.shortName ?? item.longName,
            type: item.quoteType ?? 'other',
            sector: item.sector,
            industry: item.industry,
            currency: item.currency,
          }
        }
      }

      if (pricesMap.size > 0 || metadata) {
        results.set(ticker, { prices: pricesMap, metadata })
      }
    } catch {
      // Skip failed requests
    }
  }

  return results
}

export async function getPrice(ticker: string): Promise<{ price: number } | null> {
  const db = getDb()
  const latestPrice = await db
    .select({ price: schema.stockPrices.price })
    .from(schema.stockPrices)
    .where(eq(schema.stockPrices.ticker, ticker))
    .orderBy(desc(schema.stockPrices.date))
    .limit(1)

  if (latestPrice.length > 0 && latestPrice[0]?.price != null) {
    return { price: latestPrice[0].price }
  }

  const prices = await fetchYahooPrices([ticker])
  const tickerData = prices.get(ticker)
  if (!tickerData || tickerData.prices.size === 0) return null

  const allEntries = [...tickerData.prices.entries()]
  const [, latestPriceValue] = allEntries.at(-1)!
  if (latestPriceValue != null) {
    await db
      .insert(schema.stockPrices)
      .values(
        allEntries.map(([date, price]) => ({
          id: crypto.randomUUID(),
          ticker,
          date,
          price,
        })),
      )
      .onConflictDoNothing()

    if (tickerData.metadata) {
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
            name: sql`excluded.name`,
            type: sql`excluded.type`,
            currency: sql`excluded.currency`,
            sector: sql`excluded.sector`,
            industry: sql`excluded.industry`,
          },
        })
    }
  }

  return { price: latestPriceValue }
}

export async function syncStockPrices(userId: string): Promise<{ updated: number; failed: number }> {
  const db = getDb()

  const investmentAccounts = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId))

  if (investmentAccounts.length === 0) {
    return { updated: 0, failed: 0 }
  }

  const accountIds = investmentAccounts.map((a) => a.id)

  const holdings = await db
    .select({
      id: schema.holdings.id,
      securityId: schema.holdings.securityId,
      ticker: schema.securities.ticker,
    })
    .from(schema.holdings)
    .leftJoin(schema.securities, eq(schema.holdings.securityId, schema.securities.id))
    .where(inArray(schema.holdings.accountId, accountIds))

  const tickers = [...new Set(holdings.map((h) => h.ticker).filter(Boolean))] as string[]

  if (tickers.length === 0) {
    return { updated: 0, failed: 0 }
  }

  const pricesByTicker = await fetchYahooPrices(tickers)

  let updated = 0
  let failed = 0

  for (const holding of holdings) {
    if (!holding.ticker) continue

    const tickerData = pricesByTicker.get(holding.ticker)
    if (!tickerData || tickerData.prices.size === 0) {
      failed++
      continue
    }

    try {
      await db
        .insert(schema.stockPrices)
        .values(
          [...tickerData.prices.entries()].map(([date, price]) => ({
            id: crypto.randomUUID(),
            ticker: holding.ticker!,
            date,
            price,
          })),
        )
        .onConflictDoNothing()

      const allEntries = [...tickerData.prices.entries()]
      const [, latestPrice] = allEntries.at(-1)!
      await db
        .update(schema.holdings)
        .set({ price: latestPrice, priceAsOf: new Date().toISOString().slice(0, 10) })
        .where(eq(schema.holdings.id, holding.id))

      if (tickerData.metadata) {
        await db
          .insert(schema.securities)
          .values({
            id: crypto.randomUUID(),
            ticker: holding.ticker!,
            name: tickerData.metadata.name,
            type: tickerData.metadata.type ?? 'other',
            currency: tickerData.metadata.currency ?? 'USD',
            sector: tickerData.metadata.sector,
            industry: tickerData.metadata.industry,
          })
          .onConflictDoUpdate({
            target: schema.securities.ticker,
            set: {
              name: sql`excluded.name`,
              type: sql`excluded.type`,
              currency: sql`excluded.currency`,
              sector: sql`excluded.sector`,
              industry: sql`excluded.industry`,
            },
          })
      }

      updated++
    } catch {
      failed++
    }
  }

  return { updated, failed }
}
