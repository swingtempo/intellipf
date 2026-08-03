import { getEnv } from '#/lib/env'

export interface PriceQuote {
  price: number
  currency?: string
  asOf?: string
  source: string
}

export interface PriceProvider {
  name: string
  getPrice(ticker: string): Promise<PriceQuote | null>
}

function hashTicker(ticker: string): number {
  let h = 2166136261
  for (let i = 0; i < ticker.length; i++) {
    h ^= ticker.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seededRandom(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const simulatedProvider: PriceProvider = {
  name: 'simulated',
  async getPrice(ticker) {
    const seed = hashTicker(ticker.toUpperCase())
    const rand = seededRandom(seed)
    const base = 5 + rand() * 495
    const drift = Math.sin(seed) * 0.25
    return {
      price: Math.round(base * (1 + drift) * 100) / 100,
      currency: 'USD',
      asOf: new Date().toISOString().slice(0, 10),
      source: 'simulated',
    }
  },
}

export const finnhubProvider: PriceProvider = {
  name: 'finnhub',
  async getPrice(ticker) {
    const key = getEnv('FINNHUB_API_KEY')
    if (!key) return null
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(8000) },
      )
      if (!res.ok) return null
      const data = (await res.json()) as { c?: number }
      if (typeof data.c !== 'number') return null
      return {
        price: data.c,
        currency: 'USD',
        asOf: new Date().toISOString().slice(0, 10),
        source: 'finnhub',
      }
    } catch {
      return null
    }
  },
}

export const alphaVantagePriceProvider: PriceProvider = {
  name: 'alpha_vantage',
  async getPrice(ticker) {
    const key = getEnv('ALPHA_VANTAGE_API_KEY')
    if (!key) return null
    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) return null
      const data = (await res.json()) as { 'Global Quote'?: Record<string, string> }
      const quote = data['Global Quote']
      if (!quote) return null
      const price = Number(quote['05. price'])
      if (!Number.isFinite(price)) return null
      return {
        price,
        currency: 'USD',
        asOf: quote['07. latest trading day'] ?? new Date().toISOString().slice(0, 10),
        source: 'alpha_vantage',
      }
    } catch {
      return null
    }
  },
}

function configuredProvider(): PriceProvider {
  const name = getEnv('PRICE_PROVIDER') ?? 'simulated'
  if (name === 'finnhub' && getEnv('FINNHUB_API_KEY')) return finnhubProvider
  if (name === 'alpha_vantage' && getEnv('ALPHA_VANTAGE_API_KEY')) return alphaVantagePriceProvider
  if (name === 'simulated') return simulatedProvider
  return simulatedProvider
}

export async function getPrice(ticker: string): Promise<PriceQuote | null> {
  const provider = configuredProvider()
  const quote = await provider.getPrice(ticker)
  if (quote) return quote
  if (provider !== simulatedProvider) {
    const fallback = await simulatedProvider.getPrice(ticker)
    if (fallback) return { ...fallback, source: `simulated (fallback from ${provider.name})` }
  }
  return null
}

export async function refreshHoldingPrices(tickers: Array<{ ticker: string }>) {
  const prices = new Map<string, PriceQuote>()
  for (const { ticker } of tickers) {
    if (!ticker || prices.has(ticker)) continue
    const quote = await getPrice(ticker)
    if (quote) prices.set(ticker, quote)
  }
  return prices
}
