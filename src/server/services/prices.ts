import { desc, eq, inArray } from 'drizzle-orm'
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

async function fetchYahooPrices(tickers: string[]): Promise<Map<string, Map<string, number>>> {
  const results = new Map<string, Map<string, number>>()

  for (const ticker of tickers) {
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=30d&interval=1d`,
        { headers: { 'User-Agent': 'IntelliPF/1.0' } },
      )

      if (!response.ok) continue

      const json = (await response.json()) as { chart?: { result: YahooChartResult[]; error?: unknown } }
      const chart = json?.chart?.result?.[0]
      if (!chart) continue

      const timestamps = chart.timestamp
      const closes = chart.indicators?.quote?.[0]?.close
      if (!timestamps || !closes) continue

      const pricesByDate = new Map<string, number>()
      for (let i = 0; i < timestamps.length; i++) {
        const close = closes[i]
        if (close == null) continue
        const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10)
        pricesByDate.set(date, Number(close))
      }

      results.set(ticker, pricesByDate)
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
  if (!tickerData || tickerData.size === 0) return null

  const [, latestPriceValue] = [...tickerData.entries()].at(-1)!
  if (latestPriceValue != null) {
    await db
      .insert(schema.stockPrices)
      .values(
        [...tickerData.entries()].map(([date, price]) => ({
          id: crypto.randomUUID(),
          ticker,
          date,
          price,
        })),
      )
      .onConflictDoNothing()
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
    if (!tickerData || tickerData.size === 0) {
      failed++
      continue
    }

    try {
      await db
        .insert(schema.stockPrices)
        .values(
          [...tickerData.entries()].map(([date, price]) => ({
            id: crypto.randomUUID(),
            ticker: holding.ticker!,
            date,
            price,
          })),
        )
        .onConflictDoNothing()

      const [, latestPrice] = [...tickerData.entries()].at(-1)!
      await db
        .update(schema.holdings)
        .set({ price: latestPrice, priceAsOf: new Date().toISOString().slice(0, 10) })
        .where(eq(schema.holdings.id, holding.id))

      updated++
    } catch {
      failed++
    }
  }

  return { updated, failed }
}
