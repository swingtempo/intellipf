import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '#/server/db/schema'

const plaidMocks = vi.hoisted(() => ({
  transactionsSync: vi.fn(),
  itemRemove: vi.fn(),
  accountsGet: vi.fn(),
  investmentsHoldingsGet: vi.fn(),
  linkTokenCreate: vi.fn(),
  itemPublicTokenExchange: vi.fn(),
}))

vi.mock('plaid', () => ({
  Configuration: class {},
  PlaidApi: class {
    transactionsSync = plaidMocks.transactionsSync
    itemRemove = plaidMocks.itemRemove
    accountsGet = plaidMocks.accountsGet
    investmentsHoldingsGet = plaidMocks.investmentsHoldingsGet
    linkTokenCreate = plaidMocks.linkTokenCreate
    itemPublicTokenExchange = plaidMocks.itemPublicTokenExchange
  },
  PlaidEnvironments: { sandbox: 'https://sandbox.plaid.com' },
}))

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
      updated_at TEXT DEFAULT 'now'
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

    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      plaid_transaction_id TEXT,
      source TEXT NOT NULL DEFAULT 'plaid',
      amount REAL NOT NULL,
      name TEXT NOT NULL,
      merchant_name TEXT,
      category TEXT,
      date TEXT NOT NULL,
      currency_code TEXT NOT NULL DEFAULT 'USD',
      pending INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT 'now'
    );

    CREATE TABLE transaction_match_reviews (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      local_transaction_id TEXT NOT NULL REFERENCES transactions(id),
      online_transaction_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT 'now',
      updated_at TEXT DEFAULT 'now'
    );

    CREATE TABLE balances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      date TEXT NOT NULL,
      available REAL,
      current REAL,
      \`limit\` REAL,
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
  `)

  return sqlite
}

const testDb = createTestDb()
const dbInstance = drizzle(testDb, { schema })

vi.mock('#/server/db', () => ({
  getDb: () => dbInstance,
  schema,
}))

import { syncTransactionsForItem, removePlaidItem } from '#/server/services/plaid'

function seedItem() {
  testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test User');`)
  testDb.exec(
    `INSERT INTO plaid_items (id, user_id, plaid_item_id, access_token, institution_name)
     VALUES ('item1', 'u1', 'pi1', 'access-1', 'Test Bank');`,
  )
  testDb.exec(
    `INSERT INTO accounts (id, user_id, plaid_item_id, plaid_account_id, source, name, is_active)
     VALUES ('acct1', 'u1', 'item1', 'pa1', 'plaid', 'Checking', 1);`,
  )
}

function insertTx(
  id: string,
  overrides: Partial<{
    accountId: string
    plaidTransactionId: string | null
    source: string
    amount: number
    name: string
    merchantName: string | null
    category: string | null
    date: string
    notes: string | null
  }> = {},
) {
  const values = {
    accountId: 'acct1',
    plaidTransactionId: null as string | null,
    source: 'plaid',
    amount: 0,
    name: 'Tx',
    merchantName: null as string | null,
    category: null as string | null,
    date: '2025-01-15',
    notes: null as string | null,
    ...overrides,
  }
  testDb
    .prepare(
      `INSERT INTO transactions (id, user_id, account_id, plaid_transaction_id, source, amount, name, merchant_name, category, date, notes)
       VALUES (?, 'u1', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      values.accountId,
      values.plaidTransactionId,
      values.source,
      values.amount,
      values.name,
      values.merchantName,
      values.category,
      values.date,
      values.notes,
    )
}

function plaidTx(overrides: Record<string, unknown> = {}) {
  return {
    transaction_id: 'p1',
    account_id: 'pa1',
    amount: 42.5,
    date: '2025-01-15',
    name: 'Starbucks Coffee',
    merchant_name: 'Starbucks',
    iso_currency_code: 'USD',
    pending: false,
    ...overrides,
  }
}

beforeEach(() => {
  testDb.exec('DELETE FROM transaction_match_reviews')
  testDb.exec('DELETE FROM transactions')
  testDb.exec('DELETE FROM balances')
  testDb.exec('DELETE FROM holdings')
  testDb.exec('DELETE FROM accounts')
  testDb.exec('DELETE FROM plaid_items')
  testDb.exec('DELETE FROM users')
  plaidMocks.transactionsSync.mockReset()
  plaidMocks.itemRemove.mockReset()
  vi.stubEnv('PLAID_CLIENT_ID', 'test-client')
  vi.stubEnv('PLAID_SECRET', 'test-secret')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('syncTransactionsForItem', () => {
  it('inserts new plaid transactions with the correlation id', async () => {
    seedItem()
    plaidMocks.transactionsSync.mockResolvedValueOnce({
      data: {
        added: [plaidTx()],
        modified: [],
        removed: [],
        next_cursor: 'cursor1',
        has_more: false,
      },
    })

    const result = await syncTransactionsForItem('item1')
    expect(result).toMatchObject({ added: 1, modified: 0, removed: 0, merged: 0, review: 0 })

    const rows = testDb.prepare('SELECT * FROM transactions').all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      plaid_transaction_id: 'p1',
      source: 'plaid',
      name: 'Starbucks Coffee',
      amount: 42.5,
      date: '2025-01-15',
    })
  })

  it('updates an existing transaction by plaid id instead of duplicating', async () => {
    seedItem()
    insertTx('t1', { source: 'plaid', plaidTransactionId: 'p1', amount: 10, name: 'Old' })
    plaidMocks.transactionsSync.mockResolvedValueOnce({
      data: {
        added: [plaidTx({ amount: 12, name: 'New' })],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      },
    })

    const result = await syncTransactionsForItem('item1')
    expect(result.modified).toBe(1)

    const rows = testDb.prepare('SELECT * FROM transactions').all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: 12, name: 'New', plaid_transaction_id: 'p1' })
  })

  it('merges a high-confidence local match into one row and preserves edits', async () => {
    seedItem()
    insertTx('t1', {
      source: 'qif',
      amount: 42.5,
      name: 'Starbucks Coffee',
      date: '2025-01-15',
      category: '["Food and Drink"]',
      notes: 'split with friend',
    })
    plaidMocks.transactionsSync.mockResolvedValueOnce({
      data: {
        added: [plaidTx()],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      },
    })

    const result = await syncTransactionsForItem('item1')
    expect(result).toMatchObject({ added: 0, merged: 1, review: 0 })

    const rows = testDb.prepare('SELECT * FROM transactions').all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 't1',
      plaid_transaction_id: 'p1',
      source: 'qif',
      merchant_name: 'Starbucks',
      category: '["Food and Drink"]',
      notes: 'split with friend',
    })
  })

  it('creates a review for a low-confidence match instead of auto-merging', async () => {
    seedItem()
    insertTx('t1', {
      source: 'qif',
      amount: 42.5,
      name: 'Local Groceries',
      date: '2025-01-15',
    })
    plaidMocks.transactionsSync.mockResolvedValueOnce({
      data: {
        added: [plaidTx({ name: 'Safeway Market', merchant_name: 'Safeway' })],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      },
    })

    const result = await syncTransactionsForItem('item1')
    expect(result).toMatchObject({ added: 0, merged: 0, review: 1 })

    const rows = testDb.prepare('SELECT * FROM transactions').all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    const reviews = testDb
      .prepare('SELECT * FROM transaction_match_reviews')
      .all() as Array<Record<string, unknown>>
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({
      local_transaction_id: 't1',
      online_transaction_id: 'p1',
      status: 'pending',
    })
  })

  it('deletes a plaid-source transaction when Plaid removes it', async () => {
    seedItem()
    insertTx('t1', { source: 'plaid', plaidTransactionId: 'p1', amount: 42.5 })
    plaidMocks.transactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [{ transaction_id: 'p1', account_id: 'pa1' }],
        next_cursor: 'c1',
        has_more: false,
      },
    })

    const result = await syncTransactionsForItem('item1')
    expect(result.removed).toBe(1)
    expect(testDb.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 0 })
  })

  it('keeps a merged local row and clears its correlation when Plaid removes it', async () => {
    seedItem()
    insertTx('t1', {
      source: 'qif',
      plaidTransactionId: 'p1',
      amount: 42.5,
      name: 'Starbucks Coffee',
    })
    plaidMocks.transactionsSync.mockResolvedValueOnce({
      data: {
        added: [],
        modified: [],
        removed: [{ transaction_id: 'p1', account_id: 'pa1' }],
        next_cursor: 'c1',
        has_more: false,
      },
    })

    const result = await syncTransactionsForItem('item1')
    expect(result.removed).toBe(1)
    const rows = testDb.prepare('SELECT * FROM transactions').all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 't1', plaid_transaction_id: null, source: 'qif' })
  })

  it('does not duplicate when syncing the same transaction twice', async () => {
    seedItem()
    plaidMocks.transactionsSync.mockResolvedValueOnce({
      data: {
        added: [plaidTx()],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      },
    })
    plaidMocks.transactionsSync.mockResolvedValueOnce({
      data: {
        added: [plaidTx()],
        modified: [],
        removed: [],
        next_cursor: 'c2',
        has_more: false,
      },
    })

    await syncTransactionsForItem('item1')
    await syncTransactionsForItem('item1')
    expect(testDb.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 1 })
  })

  it('does not duplicate a merged local row when syncing the same transaction twice', async () => {
    seedItem()
    insertTx('t1', {
      source: 'qif',
      amount: 42.5,
      name: 'Starbucks Coffee',
      date: '2025-01-15',
    })
    plaidMocks.transactionsSync.mockResolvedValueOnce({
      data: {
        added: [plaidTx()],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      },
    })
    plaidMocks.transactionsSync.mockResolvedValueOnce({
      data: {
        added: [plaidTx()],
        modified: [],
        removed: [],
        next_cursor: 'c2',
        has_more: false,
      },
    })

    await syncTransactionsForItem('item1')
    await syncTransactionsForItem('item1')
    const rows = testDb.prepare('SELECT * FROM transactions').all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 't1', plaid_transaction_id: 'p1', source: 'qif' })
  })
})

describe('removePlaidItem', () => {
  it('deletes only plaid-source transactions and clears correlation on local ones', async () => {
    seedItem()
    insertTx('t1', { source: 'plaid', plaidTransactionId: 'p1' })
    insertTx('t2', { source: 'qif', plaidTransactionId: 'p2', name: 'Merged' })
    insertTx('t3', { source: 'qif', name: 'Local only' })
    testDb.exec(
      `INSERT INTO transaction_match_reviews (id, user_id, account_id, local_transaction_id, online_transaction_id, status)
       VALUES ('r1', 'u1', 'acct1', 't2', 'p1', 'pending');`,
    )
    plaidMocks.itemRemove.mockResolvedValueOnce({ data: { request_id: 'r' } })

    const ok = await removePlaidItem('u1', 'item1')
    expect(ok).toBe(true)

    const rows = testDb.prepare('SELECT * FROM transactions ORDER BY id').all() as Array<Record<string, unknown>>
    expect(rows.map((r) => r.id)).toEqual(['t2', 't3'])
    expect(rows.find((r) => r.id === 't2')).toMatchObject({
      plaid_transaction_id: null,
      source: 'qif',
    })
    expect(testDb.prepare('SELECT COUNT(*) AS n FROM transaction_match_reviews').get()).toEqual({
      n: 0,
    })
    const account = testDb.prepare('SELECT * FROM accounts').get() as Record<string, unknown>
    expect(account).toMatchObject({ id: 'acct1', plaid_item_id: null, source: 'manual' })
    expect(testDb.prepare('SELECT COUNT(*) AS n FROM plaid_items').get()).toEqual({ n: 0 })
  })
})
