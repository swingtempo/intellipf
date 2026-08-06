import { describe, expect, it, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '#/server/db/schema'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  // foreign_keys must be OFF because plaid_items may not exist when accounts reference it
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

    CREATE TABLE plaid_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plaid_item_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      institution_id TEXT,
      institution_name TEXT,
      cursor TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      error TEXT,
      last_sync_at TEXT,
      created_at TEXT DEFAULT 'now',
      updated_at TEXT DEFAULT 'now',
      UNIQUE(plaid_item_id)
    );

    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plaid_item_id TEXT REFERENCES plaid_items(id),
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

describe('getPortfolio', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM security_allocations')
    testDb.exec('DELETE FROM stock_prices')
    testDb.exec('DELETE FROM holdings')
    testDb.exec('DELETE FROM securities')
    testDb.exec('DELETE FROM accounts')
    testDb.exec('DELETE FROM plaid_items')
    testDb.exec('DELETE FROM users')
    vi.clearAllMocks()
  })

  it('returns null breakdown when no investment accounts exist', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    // No investment accounts inserted

    const { getPortfolio } = await import('#/server/services/queries')
    const result = await getPortfolio('u1')

    expect(result.priceSourceBreakdown).toBeNull()
    expect(result.allocationsUpdatedAt).toBeNull()
    expect(result.priceLastSyncedAt).toBeNull()
  })

  it('sets priceSource to yahoo_finance when stock_prices exist for a ticker', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity, price) VALUES ('h1', 'a1', 's1', 10, 150.0);`)
    testDb.exec(`INSERT INTO stock_prices (id, ticker, date, price) VALUES ('sp1', 'AAPL', '2024-06-01', 190.0);`)

    const { getPortfolio } = await import('#/server/services/queries')
    const result = await getPortfolio('u1')

    expect(result.holdings.length).toBe(1)
    expect(result.holdings[0]!.priceSource).toBe('yahoo_finance')
    expect(result.priceSourceBreakdown).toEqual({ yahoo_finance: 1, simulated: 0 })
  })

  it('sets priceSource to null when no stock_prices exist for a ticker', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity, price) VALUES ('h1', 'a1', 's1', 10, null);`)
    // No stock_prices for AAPL

    const { getPortfolio } = await import('#/server/services/queries')
    const result = await getPortfolio('u1')

    expect(result.holdings.length).toBe(1)
    expect(result.holdings[0]!.priceSource).toBeNull()
    // No tickers have prices so breakdown is null
    expect(result.priceSourceBreakdown).toBeNull()
  })

  it('returns mixed price sources across multiple holdings', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s2', 'BND', 'Vanguard Bond ETF');`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity, price) VALUES ('h1', 'a1', 's1', 10, 150.0);`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity, price) VALUES ('h2', 'a1', 's2', 5, 72.0);`)
    // Only AAPL has prices
    testDb.exec(`INSERT INTO stock_prices (id, ticker, date, price) VALUES ('sp1', 'AAPL', '2024-06-01', 190.0);`)

    const { getPortfolio } = await import('#/server/services/queries')
    const result = await getPortfolio('u1')

    // BND has no prices but is still counted as simulated since it's a known ticker
    expect(result.priceSourceBreakdown).toEqual({ yahoo_finance: 1, simulated: 1 })
    const aapl = result.holdings.find((h) => h.ticker === 'AAPL')
    const bnd = result.holdings.find((h) => h.ticker === 'BND')
    expect(aapl!.priceSource).toBe('yahoo_finance')
    expect(bnd!.priceSource).toBeNull()
  })

  it('returns allocationsUpdatedAt from security_allocations', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity, price) VALUES ('h1', 'a1', 's1', 10, 150.0);`)
    testDb.exec(`INSERT INTO stock_prices (id, ticker, date, price) VALUES ('sp1', 'AAPL', '2024-06-01', 190.0);`)
    testDb.exec(`INSERT INTO security_allocations (id, user_id, ticker, allocations, updated_at) VALUES ('sa1', 'u1', 'AAPL', '[{"assetClass":"Equity","weight":1}]', '2025-08-06T10:00:00.000Z');`)

    const { getPortfolio } = await import('#/server/services/queries')
    const result = await getPortfolio('u1')

    expect(result.allocationsUpdatedAt).toBe('2025-08-06T10:00:00.000Z')
  })

  it('returns priceLastSyncedAt from the latest stock_prices date', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity, price) VALUES ('h1', 'a1', 's1', 10, 150.0);`)
    testDb.exec(`INSERT INTO stock_prices (id, ticker, date, price) VALUES ('sp1', 'AAPL', '2024-06-01', 190.0);`)
    testDb.exec(`INSERT INTO stock_prices (id, ticker, date, price) VALUES ('sp2', 'AAPL', '2024-06-15', 195.0);`)

    const { getPortfolio } = await import('#/server/services/queries')
    const result = await getPortfolio('u1')

    expect(result.priceLastSyncedAt).toBe('2024-06-15')
  })

  it('returns null for allocationsUpdatedAt and priceLastSyncedAt when no data exists', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name, type) VALUES ('a1', 'u1', 'Brokerage', 'investment');`)
    testDb.exec(`INSERT INTO securities (id, ticker, name) VALUES ('s1', 'AAPL', 'Apple Inc.');`)
    testDb.exec(`INSERT INTO holdings (id, account_id, security_id, quantity, price) VALUES ('h1', 'a1', 's1', 10, null);`)

    const { getPortfolio } = await import('#/server/services/queries')
    const result = await getPortfolio('u1')

    expect(result.allocationsUpdatedAt).toBeNull()
    expect(result.priceLastSyncedAt).toBeNull()
    // No prices exist so breakdown is null
    expect(result.priceSourceBreakdown).toBeNull()
  })
})
