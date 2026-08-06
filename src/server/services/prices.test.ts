import { describe, expect, it, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '#/server/db/schema'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      created_at TEXT DEFAULT 'now'
    );

    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT DEFAULT 'now'
    );

    CREATE TABLE securities (
      id TEXT PRIMARY KEY,
      ticker TEXT UNIQUE,
      name TEXT,
      type TEXT DEFAULT 'stock',
      currency TEXT DEFAULT 'USD',
      isin TEXT,
      sector TEXT,
      industry TEXT,
      updated_at TEXT DEFAULT 'now'
    );

    CREATE TABLE holdings (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      security_id TEXT NOT NULL REFERENCES securities(id),
      quantity REAL NOT NULL DEFAULT 0,
      price REAL,
      cost_basis REAL,
      price_as_of TEXT,
      updated_at TEXT DEFAULT 'now'
    );

    CREATE TABLE stock_prices (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      date TEXT NOT NULL,
      price REAL NOT NULL,
      created_at TEXT DEFAULT 'now',
      UNIQUE(ticker, date)
    );
  `)

  return sqlite
}

const testDb = createTestDb()
const dbInstance = drizzle(testDb, { schema })

vi.mock('#/server/db', () => ({
  getDb: () => dbInstance,
  schema,
}))

function makeYahooChartResponse(ticker: string, closes: number[]): object {
  const now = Math.floor(Date.now() / 1000)
  const timestamps = []
  for (let i = closes.length - 1; i >= 0; i--) {
    timestamps.push(now - i * 86400)
  }
  return {
    chart: {
      result: [
        {
          meta: { regularMarketPrice: closes[closes.length - 1], symbol: ticker },
          timestamp: timestamps,
          indicators: { quote: [{ close: closes }] },
        },
      ],
      error: undefined,
    },
  }
}

function makeYahooSearchResponse(ticker: string): object {
  return {
    quoteResponse: {
      result: [
        {
          symbol: ticker,
          shortName: `${ticker} Inc.`,
          longName: `${ticker} Incorporated`,
          quoteType: 'EQUITY',
          sector: 'Technology',
          industry: 'Consumer Electronics',
          currency: 'USD',
        },
      ],
      error: undefined,
    },
  }
}

describe('getPrice', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM stock_prices')
    testDb.exec('DELETE FROM holdings')
    testDb.exec('DELETE FROM securities')
    testDb.exec('DELETE FROM accounts')
    testDb.exec('DELETE FROM users')
    vi.clearAllMocks()
  })

  it('returns null when no price exists and fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'))

    const { getPrice } = await import('#/server/services/prices')
    const result = await getPrice('AAPL')
    expect(result).toBeNull()
  })

  it('returns the latest price from stock_prices table', async () => {
    testDb.exec(`
      INSERT INTO users (id, name) VALUES ('u1', 'Test');
      INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');
      INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');
      INSERT INTO holdings (id, account_id, security_id, quantity) VALUES ('h1', 'a1', 's1', 10);
    `)

    testDb.exec(`
      INSERT INTO stock_prices (id, ticker, date, price) VALUES ('sp1', 'AAPL', '2024-01-01', 150.0);
      INSERT INTO stock_prices (id, ticker, date, price) VALUES ('sp2', 'AAPL', '2024-01-02', 155.5);
    `)

    const { getPrice } = await import('#/server/services/prices')
    const result = await getPrice('AAPL')
    expect(result).toEqual({ price: 155.5 })
  })

  it('fetches from Yahoo and stores prices when not in DB', async () => {
    testDb.exec(`
      INSERT INTO users (id, name) VALUES ('u1', 'Test');
      INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');
      INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');
      INSERT INTO holdings (id, account_id, security_id, quantity) VALUES ('h1', 'a1', 's1', 10);
    `)

    const yahooChart = makeYahooChartResponse('AAPL', [148.0, 150.0, 152.5, 155.0])
    const yahooSearch = makeYahooSearchResponse('AAPL')
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooChart) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooSearch) })

    const { getPrice } = await import('#/server/services/prices')
    const result = await getPrice('AAPL')
    expect(result).toEqual({ price: 155.0 })

    // Verify prices were stored in DB
    const rows = testDb.prepare('SELECT id, ticker, date, price FROM stock_prices WHERE ticker = ?').all('AAPL') as Array<{ id: string; ticker: string; date: string; price: number }>
    expect(rows.length).toBe(4)
    expect(rows[rows.length - 1]).toMatchObject({ ticker: 'AAPL', price: 155.0 })
  })

  it('does not re-fetch when price already exists in DB', async () => {
    testDb.exec(`
      INSERT INTO users (id, name) VALUES ('u1', 'Test');
      INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');
      INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');
      INSERT INTO holdings (id, account_id, security_id, quantity) VALUES ('h1', 'a1', 's1', 10);
    `)

    testDb.exec(`INSERT INTO stock_prices (id, ticker, date, price) VALUES ('sp1', 'AAPL', '2024-01-01', 150.0);`)

    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { getPrice } = await import('#/server/services/prices')
    const result = await getPrice('AAPL')
    expect(result).toEqual({ price: 150.0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('syncStockPrices', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM stock_prices')
    testDb.exec('DELETE FROM holdings')
    testDb.exec('DELETE FROM securities')
    testDb.exec('DELETE FROM accounts')
    testDb.exec('DELETE FROM users')
    vi.clearAllMocks()
  })

  it('returns { updated: 0, failed: 0 } for a user with no investment accounts', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)

    const { syncStockPrices } = await import('#/server/services/prices')
    const result = await syncStockPrices('u1')
    expect(result).toEqual({ updated: 0, failed: 0 })
  })

  it('fetches and stores historical prices for each holding', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity) VALUES ('h1', 'a1', 's1', 10);`)

    const yahooAaplChart = makeYahooChartResponse('AAPL', [148.0, 150.0, 152.5, 155.0])
    const yahooAaplSearch = makeYahooSearchResponse('AAPL')
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooAaplChart) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooAaplSearch) })

    const { syncStockPrices } = await import('#/server/services/prices')
    const result = await syncStockPrices('u1')

    expect(result.updated).toBe(1)
    expect(result.failed).toBe(0)

    // Verify historical prices were stored
    const rows = testDb.prepare('SELECT date, price FROM stock_prices WHERE ticker = ? ORDER BY date').all('AAPL') as Array<{ date: string; price: number }>
    expect(rows.length).toBe(4)

    const now = Math.floor(Date.now() / 1000)
    const expectedDates = [3, 2, 1, 0].map((offset) => new Date((now - offset * 86400) * 1000).toISOString().slice(0, 10))
    expect(rows.map((r) => r.date)).toEqual(expectedDates)
    expect(rows[0].price).toBe(148.0)
    expect(rows[3].price).toBe(155.0)
  })

  it('updates the holding price to the latest value and sets price_as_of', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity, price) VALUES ('h1', 'a1', 's1', 10, 140.0);`)

    const yahooAaplChart = makeYahooChartResponse('AAPL', [148.0, 150.0, 152.5, 155.0])
    const yahooAaplSearch = makeYahooSearchResponse('AAPL')
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooAaplChart) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooAaplSearch) })

    const { syncStockPrices } = await import('#/server/services/prices')
    await syncStockPrices('u1')

    const holding = testDb.prepare('SELECT price, price_as_of FROM holdings WHERE id = ?').get('h1') as { price: number; price_as_of: string } | undefined
    expect(holding).toBeDefined()
    expect(holding!.price).toBe(155.0)
    expect(holding!.price_as_of.length).toBe(10) // YYYY-MM-DD format
  })

  it('handles multiple tickers', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s2', 'MSFT', 'Microsoft Corp.');`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity) VALUES ('h1', 'a1', 's1', 10);`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity) VALUES ('h2', 'a1', 's2', 5);`)

    const yahooAaplChart = makeYahooChartResponse('AAPL', [148.0, 150.0, 155.0])
    const yahooAaplSearch = makeYahooSearchResponse('AAPL')
    const yahooMsftChart = makeYahooChartResponse('MSFT', [380.0, 385.0, 390.0])
    const yahooMsftSearch = makeYahooSearchResponse('MSFT')
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooAaplChart) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooAaplSearch) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooMsftChart) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooMsftSearch) })

    const { syncStockPrices } = await import('#/server/services/prices')
    const result = await syncStockPrices('u1')

    expect(result.updated).toBe(2)
    expect(result.failed).toBe(0)

    const aaplRows = testDb.prepare('SELECT COUNT(*) as cnt FROM stock_prices WHERE ticker = ?').get('AAPL') as { cnt: number }
    const msftRows = testDb.prepare('SELECT COUNT(*) as cnt FROM stock_prices WHERE ticker = ?').get('MSFT') as { cnt: number }
    expect(aaplRows.cnt).toBe(3)
    expect(msftRows.cnt).toBe(3)
  })

  it('counts failed tickers when Yahoo returns errors', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity) VALUES ('h1', 'a1', 's1', 10);`)

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })

    const { syncStockPrices } = await import('#/server/services/prices')
    const result = await syncStockPrices('u1')

    expect(result.updated).toBe(0)
    expect(result.failed).toBe(1)
  })

  it('inserts are idempotent — duplicate sync does not create duplicates', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity) VALUES ('h1', 'a1', 's1', 10);`)

    const yahooAaplChart = makeYahooChartResponse('AAPL', [148.0, 150.0, 155.0])
    const yahooAaplSearch = makeYahooSearchResponse('AAPL')
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooAaplChart) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(yahooAaplSearch) })

    const { syncStockPrices } = await import('#/server/services/prices')
    await syncStockPrices('u1')
    await syncStockPrices('u1')

    const rows = testDb.prepare('SELECT COUNT(*) as cnt FROM stock_prices WHERE ticker = ?').get('AAPL') as { cnt: number }
    expect(rows.cnt).toBe(3)
  })
})
