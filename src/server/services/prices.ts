import { eq, inArray } from 'drizzle-orm'
import { getDb, schema } from '../db'

async function fetchYahooPrices(tickers: string[]): Promise<Map<string, number>> {
  const results = new Map<string, number>()
  
  for (const ticker of tickers) {
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`, {
        headers: { 'User-Agent': 'IntelliPF/1.0' }
      })
      
      if (!response.ok) continue
      
      const json = await response.json()
      const meta = json?.chart?.result?.[0]?.meta
      if (meta?.regularMarketPrice != null) {
        results.set(ticker, Number(meta.regularMarketPrice))
      }
    } catch {
      // Skip failed requests
    }
  }
  
  return results
}

export async function getPrice(ticker: string): Promise<{ price: number } | null> {
  const prices = await fetchYahooPrices([ticker])
  const price = prices.get(ticker)
  if (price != null) {
    return { price }
  }
  return null
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
  
  const prices = await fetchYahooPrices(tickers)
  
  let updated = 0
  let failed = 0
  
  for (const holding of holdings) {
    if (!holding.ticker) continue
    
    const price = prices.get(holding.ticker)
    if (price != null) {
      try {
        await db
          .update(schema.holdings)
          .set({ 
            price,
            priceAsOf: new Date().toISOString().slice(0, 10),
          })
          .where(eq(schema.holdings.id, holding.id))
        updated++
      } catch {
        failed++
      }
    } else {
      failed++
    }
  }
  
  return { updated, failed }
}
