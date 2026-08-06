import { describe, expect, it, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '#/server/db/schema'
import { computePortfolioAllocation } from '#/server/services/allocations'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  // Disable FK so we can insert users/rows in any order
  sqlite.pragma('foreign_keys = OFF')

  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
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

    CREATE TABLE stock_prices (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      date TEXT NOT NULL,
      price REAL NOT NULL,
      created_at TEXT DEFAULT 'now',
      UNIQUE(ticker, date)
    );

    CREATE TABLE security_allocations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      ticker TEXT NOT NULL,
      allocations TEXT NOT NULL,
      updated_at TEXT DEFAULT 'now'
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

beforeEach(() => {
  testDb.prepare('DELETE FROM security_allocations').run()
  testDb.prepare('DELETE FROM stock_prices').run()
  vi.restoreAllMocks()
})

describe('computePortfolioAllocation source tracking', () => {
  it('marks user_defined when allocation exists in DB for the ticker', async () => {
    const userId = 'user-1'
    const ticker = 'QQQ'
    testDb.prepare(
      `INSERT INTO security_allocations (id, user_id, ticker, allocations, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      userId,
      ticker,
      JSON.stringify([{ assetClass: 'Equity', weight: 1 }]),
      new Date().toISOString(),
    )

    const result = await computePortfolioAllocation(
      [{ securityId: 'sec-1', ticker, name: 'QQQ', type: 'stock', quantity: 10, price: null }],
      userId,
    )

    expect(result.entries[0].source).toBe('user_defined')
    expect(result.source).toBe('user_defined')
  })

  it('marks fallback when no real providers are configured', async () => {
    const userId = 'user-2'
    const ticker = 'QQQ'
    // No DB row and no API keys in test env → simulated provider runs but is treated as fallback
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')))

    const result = await computePortfolioAllocation(
      [{ securityId: 'sec-1', ticker, name: 'QQQ', type: 'stock', quantity: 10, price: null }],
      userId,
    )

    expect(result.entries[0].source).toBe('fallback')
  })

  it('marks allocation_provider when a real provider returns data (mocked)', async () => {
    const userId = 'user-5'
    const ticker = 'QQQ'
    // Set the env var directly so getEnv picks it up
    process.env.ALPHA_VANTAGE_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ AssetType: 'ETF', Sector: 'Technology', Name: 'Invesco QQQ Trust' }),
    }))

    const result = await computePortfolioAllocation(
      [{ securityId: 'sec-1', ticker, name: 'QQQ', type: 'stock', quantity: 10, price: null }],
      userId,
    )

    expect(result.entries[0].source).toBe('allocation_provider')
    expect(result.entries[0].allocations[0].assetClass).toBe('Equity')

    // Clean up
    delete process.env.ALPHA_VANTAGE_API_KEY
  })

  it('marks fallback when neither DB nor provider has data', async () => {
    const userId = 'user-3'
    // Use a ticker that classifyTicker will return 'Other' for (long unknown ticker)
    const ticker = 'UNKNOWNLONGTICKER'

    const result = await computePortfolioAllocation(
      [{ securityId: 'sec-1', ticker, name: null, type: 'other', quantity: 5, price: null }],
      userId,
    )

    expect(result.entries[0].source).toBe('fallback')
    expect(result.source).toBe('fallback')
  })

  it('computes dominant source across mixed entries', async () => {
    const userId = 'user-4'
    const tickerWithDb = 'QQQ'
    const tickerWithoutDb = 'UNKNOWNLONGTICKER'

    testDb.prepare(
      `INSERT INTO security_allocations (id, user_id, ticker, allocations, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      userId,
      tickerWithDb,
      JSON.stringify([{ assetClass: 'Equity', weight: 1 }]),
      new Date().toISOString(),
    )

    const result = await computePortfolioAllocation(
      [
        { securityId: 'sec-1', ticker: tickerWithDb, name: 'QQQ', type: 'stock', quantity: 10, price: null },
        { securityId: 'sec-2', ticker: tickerWithoutDb, name: null, type: 'other', quantity: 5, price: null },
      ],
      userId,
    )

    expect(result.entries[0].source).toBe('user_defined')
    expect(result.entries[1].source).toBe('fallback')
    // dominant = first source found in priority order: user_defined > allocation_provider > fallback
    expect(result.source).toBe('user_defined')
  })
})
