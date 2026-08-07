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
  `)

  return sqlite
}

const testDb = createTestDb()
const dbInstance = drizzle(testDb, { schema })

vi.mock('#/server/db', () => ({
  getDb: () => dbInstance,
  schema,
}))

vi.mock('#/server/user', () => ({
  ensureUserScoped: vi.fn().mockResolvedValue('user-123'),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: (_opts?: unknown) => ({
    validator: (_z?: unknown) => ({
      handler: (fn: (args: unknown) => unknown) => fn,
    }),
    handler: (fn: (args: unknown) => unknown) => fn,
  }),
}))

import { resolveMatchReview, syncItem } from '#/server/api/plaid'

beforeEach(() => {
  testDb.exec('DELETE FROM transaction_match_reviews')
  testDb.exec('DELETE FROM transactions')
  testDb.exec('DELETE FROM accounts')
  testDb.exec('DELETE FROM plaid_items')
  testDb.exec('DELETE FROM users')
})

describe('resolveMatchReview server function', () => {
  it('merges a review owned by the current user', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('user-123', 'Test');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name) VALUES ('a1', 'user-123', 'Checking');`)
    testDb.exec(
      `INSERT INTO transactions (id, user_id, account_id, source, amount, name, date)
       VALUES ('t1', 'user-123', 'a1', 'qif', 42.5, 'Local', '2025-01-15');`,
    )
    testDb.exec(
      `INSERT INTO transactions (id, user_id, account_id, plaid_transaction_id, source, amount, name, date)
       VALUES ('t2', 'user-123', 'a1', 'p1', 'plaid', 42.5, 'Online', '2025-01-15');`,
    )
    testDb.exec(
      `INSERT INTO transaction_match_reviews (id, user_id, account_id, local_transaction_id, online_transaction_id, status)
       VALUES ('r1', 'user-123', 'a1', 't1', 'p1', 'pending');`,
    )

    const ok = await (resolveMatchReview as (args: { data: unknown }) => Promise<boolean>)({
      data: { reviewId: 'r1', action: 'merge' },
    })
    expect(ok).toBe(true)
    const review = testDb
      .prepare('SELECT * FROM transaction_match_reviews WHERE id = ?')
      .get('r1') as { status: string }
    expect(review.status).toBe('merged')
  })

  it('refuses to touch a review owned by another user', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('user-123', 'Test');`)
    testDb.exec(`INSERT INTO users (id, name) VALUES ('other-user', 'Other');`)
    testDb.exec(`INSERT INTO accounts (id, user_id, name) VALUES ('a1', 'user-123', 'Checking');`)
    testDb.exec(
      `INSERT INTO transactions (id, user_id, account_id, source, amount, name, date)
       VALUES ('t1', 'user-123', 'a1', 'qif', 42.5, 'Local', '2025-01-15');`,
    )
    testDb.exec(
      `INSERT INTO transactions (id, user_id, account_id, source, amount, name, date)
       VALUES ('t2', 'user-123', 'a1', 'plaid', 42.5, 'Online', '2025-01-15');`,
    )
    testDb.exec(
      `INSERT INTO transaction_match_reviews (id, user_id, account_id, local_transaction_id, online_transaction_id, status)
       VALUES ('r1', 'other-user', 'a1', 't1', 'p1', 'pending');`,
    )

    const ok = await (resolveMatchReview as (args: { data: unknown }) => Promise<boolean>)({
      data: { reviewId: 'r1', action: 'merge' },
    })
    expect(ok).toBe(false)
  })
})

describe('syncItem server function', () => {
  it('rejects items owned by another user', async () => {
    testDb.exec(`INSERT INTO users (id, name) VALUES ('user-123', 'Test');`)
    testDb.exec(`INSERT INTO users (id, name) VALUES ('other-user', 'Other');`)
    testDb.exec(
      `INSERT INTO plaid_items (id, user_id, plaid_item_id, access_token)
       VALUES ('item1', 'other-user', 'pi1', 'at');`,
    )

    await expect(
      (syncItem as (args: { data: unknown }) => Promise<unknown>)({
        data: { itemId: 'item1' },
      }),
    ).rejects.toThrow('Plaid item not found')
  })
})
