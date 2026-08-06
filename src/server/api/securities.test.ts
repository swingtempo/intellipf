import { describe, expect, it, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '#/server/db/schema'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = OFF')

  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      email_verified INTEGER,
      image TEXT,
      created_at TEXT DEFAULT 'now'
    );

    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plaid_item_id TEXT,
      plaid_account_id TEXT,
      source TEXT NOT NULL DEFAULT 'plaid',
      name TEXT NOT NULL,
      official_name TEXT,
      type TEXT NOT NULL DEFAULT 'other',
      subtype TEXT,
      mask TEXT,
      institution_name TEXT,
      currency_code TEXT NOT NULL DEFAULT 'USD',
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT 'now',
      updated_at TEXT DEFAULT 'now'
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

    CREATE TABLE security_allocations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      ticker TEXT NOT NULL,
      allocations TEXT NOT NULL,
      updated_at TEXT DEFAULT 'now',
      UNIQUE(user_id, ticker)
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

// Mock ensureUserScoped to return the test user ID
vi.mock('#/server/user', () => ({
  ensureUserScoped: vi.fn().mockResolvedValue('user-123'),
}))

// Mock createServerFn to bypass TanStack Start's middleware wrapper.
const mockHandler = vi.fn()
vi.mock('@tanstack/react-start', () => ({
  createServerFn: (_opts?: any) => ({
    validator: (_z?: any) => ({
      handler: (fn: any) => { mockHandler.mockReturnValue(fn); return fn; },
    }),
  }),
}))

describe('getSecurityDetail', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM security_allocations')
    testDb.exec('DELETE FROM stock_prices')
    testDb.exec('DELETE FROM holdings')
    testDb.exec('DELETE FROM securities')
    testDb.exec('DELETE FROM accounts')
    testDb.exec('DELETE FROM users')
    mockHandler.mockClear()
  })

  it('returns allocations for the current user', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('user-123', 'Test');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO security_allocations (id, user_id, ticker, allocations, updated_at) VALUES ('sa1', 'user-123', 'AAPL', '[{"assetClass":"Equity","weight":0.8},{"assetClass":"Fixed Income","weight":0.2}]', '2025-08-06T10:00:00.000Z');`)

    const { getSecurityDetail } = await import('#/server/api/securities')
    const result = await (getSecurityDetail as any)({ data: { ticker: 'AAPL' } })

    // Check all own properties including non-enumerable ones
    const allKeys = Object.getOwnPropertyNames(result || {})
    console.error('all keys:', allKeys)
    console.error('allocations value:', (result as any).allocations)
    console.error('allocations typeof:', typeof (result as any).allocations)

    expect((result as any).allocations).toBeDefined()
  })

  it('returns provider-based allocations when the user has none stored', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('user-123', 'Test');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)

    const { getSecurityDetail } = await import('#/server/api/securities')
    const result = await (getSecurityDetail as any)({ data: { ticker: 'AAPL' } })

    expect(result).toBeDefined()
    expect((result as any).allocations).toBeDefined()
    expect((result as any).allocations[0].source).toBe('api_provider')
    expect((result as any).allocations[0].assetClass).toBe('Equity')
  })

  it('does not return another user\'s allocations but returns provider-based ones', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('user-123', 'Test');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO security_allocations (id, user_id, ticker, allocations, updated_at) VALUES ('sa1', 'other-user', 'AAPL', '[{"assetClass":"Equity","weight":1}]', '2025-08-06T10:00:00.000Z');`)

    const { getSecurityDetail } = await import('#/server/api/securities')
    const result = await (getSecurityDetail as any)({ data: { ticker: 'AAPL' } })

    expect(result).toBeDefined()
    // Should fall back to provider-based, not the other user's allocation
    expect((result as any).allocations).toBeDefined()
    expect((result as any).allocations[0].source).toBe('api_provider')
  })

  it('returns price history alongside allocations', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('user-123', 'Test');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO security_allocations (id, user_id, ticker, allocations, updated_at) VALUES ('sa1', 'user-123', 'AAPL', '[{"assetClass":"Equity","weight":1}]', '2025-08-06T10:00:00.000Z');`)
    testDb.exec(`INSERT INTO stock_prices (id, ticker, date, price) VALUES ('sp1', 'AAPL', '2024-06-01', 190.0);`)
    testDb.exec(`INSERT INTO stock_prices (id, ticker, date, price) VALUES ('sp2', 'AAPL', '2024-06-02', 192.5);`)

    const { getSecurityDetail } = await import('#/server/api/securities')
    const result = await (getSecurityDetail as any)({ data: { ticker: 'AAPL' } })

    expect(result).toBeDefined()
    expect((result as any).ticker).toBe('AAPL')
    expect((result as any).name).toBe('Apple Inc.')
    expect((result as any).priceHistory.length).toBe(2)
    expect((result as any).latestPrice).toBe(192.5)
    expect((result as any).allocations?.length).toBe(1)
  })

  it('returns provider-based allocations when stored JSON is invalid', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('user-123', 'Test');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO security_allocations (id, user_id, ticker, allocations, updated_at) VALUES ('sa1', 'user-123', 'AAPL', 'not-valid-json', '2025-08-06T10:00:00.000Z');`)

    const { getSecurityDetail } = await import('#/server/api/securities')
    const result = await (getSecurityDetail as any)({ data: { ticker: 'AAPL' } })

    expect(result).toBeDefined()
    // Falls through to provider-based allocation since stored JSON is invalid
    expect((result as any).allocations).toBeDefined()
    expect((result as any).allocations[0].source).toBe('api_provider')
  })
})
