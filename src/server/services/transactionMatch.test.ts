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

import {
  normalizeName,
  sameTransactionName,
  findLocalMatch,
  recordMatchReview,
  listPendingReviews,
  resolveMatchReview,
} from '#/server/services/transactionMatch'

function seedBase() {
  testDb.exec(`INSERT INTO users (id, name) VALUES ('u1', 'Test User');`)
  testDb.exec(
    `INSERT INTO accounts (id, user_id, plaid_account_id, source, name) VALUES ('a1', 'u1', 'pa1', 'plaid', 'Checking');`,
  )
  testDb.exec(
    `INSERT INTO accounts (id, user_id, plaid_account_id, source, name) VALUES ('a2', 'u1', 'pa2', 'plaid', 'Savings');`,
  )
}

function insertTx(
  id: string,
  overrides: Partial<{
    userId: string
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
    userId: 'u1',
    accountId: 'a1',
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      values.userId,
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

describe('normalizeName', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeName('Starbucks Coffee')).toBe('starbucks coffee')
    expect(normalizeName('AMAZON.COM, INC.')).toBe('amazon com inc')
    expect(normalizeName('  McDonald\'s   #123  ')).toBe('mcdonald s 123')
  })

  it('collapses whitespace', () => {
    expect(normalizeName('a   b    c')).toBe('a b c')
  })
})

describe('sameTransactionName', () => {
  it('matches by name', () => {
    expect(sameTransactionName('Starbucks Coffee', null, 'starbucks coffee')).toBe(true)
  })

  it('matches by merchant when name differs', () => {
    expect(sameTransactionName('SBUX', 'Starbucks', 'Starbucks')).toBe(true)
  })

  it('returns false for empty plaid name', () => {
    expect(sameTransactionName('Starbucks', null, '')).toBe(false)
  })

  it('returns false for different names', () => {
    expect(sameTransactionName('Safeway', null, 'Starbucks')).toBe(false)
  })
})

describe('findLocalMatch', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM transaction_match_reviews')
    testDb.exec('DELETE FROM transactions')
    testDb.exec('DELETE FROM accounts')
    testDb.exec('DELETE FROM users')
    seedBase()
  })

  const plaidTx = {
    transaction_id: 'p1',
    account_id: 'pa1',
    amount: 42.5,
    date: '2025-01-15',
    name: 'Starbucks Coffee',
  }

  it('returns high confidence on exact date, amount, and name', async () => {
    insertTx('t1', { source: 'qif', amount: 42.5, name: 'Starbucks Coffee', date: '2025-01-15' })
    const match = await findLocalMatch('u1', 'a1', plaidTx)
    expect(match?.transaction.id).toBe('t1')
    expect(match?.confidence).toBe('high')
  })

  it('returns low confidence when name differs but date and amount match', async () => {
    insertTx('t1', { source: 'qif', amount: 42.5, name: 'Local Groceries', date: '2025-01-15' })
    const match = await findLocalMatch('u1', 'a1', plaidTx)
    expect(match?.transaction.id).toBe('t1')
    expect(match?.confidence).toBe('low')
  })

  it('returns null when amount differs beyond tolerance', async () => {
    insertTx('t1', { source: 'qif', amount: 50, name: 'Starbucks Coffee', date: '2025-01-15' })
    expect(await findLocalMatch('u1', 'a1', plaidTx)).toBeNull()
  })

  it('returns null when date differs', async () => {
    insertTx('t1', { source: 'qif', amount: 42.5, name: 'Starbucks Coffee', date: '2025-01-16' })
    expect(await findLocalMatch('u1', 'a1', plaidTx)).toBeNull()
  })

  it('ignores transactions already correlated with Plaid', async () => {
    insertTx('t1', {
      source: 'qif',
      amount: 42.5,
      name: 'Starbucks Coffee',
      date: '2025-01-15',
      plaidTransactionId: 'existing',
    })
    expect(await findLocalMatch('u1', 'a1', plaidTx)).toBeNull()
  })

  it('ignores plaid-source transactions', async () => {
    insertTx('t1', {
      source: 'plaid',
      amount: 42.5,
      name: 'Starbucks Coffee',
      date: '2025-01-15',
    })
    expect(await findLocalMatch('u1', 'a1', plaidTx)).toBeNull()
  })

  it('does not match across accounts', async () => {
    insertTx('t1', {
      accountId: 'a2',
      source: 'qif',
      amount: 42.5,
      name: 'Starbucks Coffee',
      date: '2025-01-15',
    })
    expect(await findLocalMatch('u1', 'a1', plaidTx)).toBeNull()
  })

  it('tolerates amount within $0.01', async () => {
    insertTx('t1', { source: 'qif', amount: 42.49, name: 'Starbucks Coffee', date: '2025-01-15' })
    expect((await findLocalMatch('u1', 'a1', plaidTx))?.confidence).toBe('high')
  })
})

describe('recordMatchReview', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM transaction_match_reviews')
    testDb.exec('DELETE FROM transactions')
    testDb.exec('DELETE FROM accounts')
    testDb.exec('DELETE FROM users')
    seedBase()
  })

  it('creates a pending review and is idempotent for the same pair', async () => {
    insertTx('t1', { source: 'qif', amount: 10 })
    await recordMatchReview({
      userId: 'u1',
      accountId: 'a1',
      localTransactionId: 't1',
      onlineTransactionId: 'p1',
    })
    await recordMatchReview({
      userId: 'u1',
      accountId: 'a1',
      localTransactionId: 't1',
      onlineTransactionId: 'p1',
    })
    const rows = testDb.prepare('SELECT * FROM transaction_match_reviews').all()
    expect(rows).toHaveLength(1)
    expect((rows[0] as { status: string }).status).toBe('pending')
  })
})

describe('listPendingReviews', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM transaction_match_reviews')
    testDb.exec('DELETE FROM transactions')
    testDb.exec('DELETE FROM accounts')
    testDb.exec('DELETE FROM users')
    seedBase()
  })

  it('returns pending reviews joined with local and online transactions', async () => {
    insertTx('t1', {
      source: 'qif',
      amount: 42.5,
      name: 'Local Groceries',
      date: '2025-01-15',
      notes: 'note',
    })
    insertTx('t2', {
      source: 'plaid',
      amount: 42.5,
      name: 'Safeway Market',
      date: '2025-01-15',
      plaidTransactionId: 'p1',
    })
    await recordMatchReview({
      userId: 'u1',
      accountId: 'a1',
      localTransactionId: 't1',
      onlineTransactionId: 'p1',
    })

    const reviews = await listPendingReviews('u1', 'a1')
    expect(reviews).toHaveLength(1)
    expect(reviews[0]!.local?.id).toBe('t1')
    expect(reviews[0]!.online?.id).toBe('t2')
    expect(reviews[0]!.accountName).toBe('Checking')
  })

  it('filters by account', async () => {
    insertTx('t1', { source: 'qif', amount: 10 })
    await recordMatchReview({
      userId: 'u1',
      accountId: 'a1',
      localTransactionId: 't1',
      onlineTransactionId: 'p1',
    })
    expect(await listPendingReviews('u1', 'a2')).toHaveLength(0)
    expect(await listPendingReviews('u1')).toHaveLength(1)
  })
})

describe('resolveMatchReview', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM transaction_match_reviews')
    testDb.exec('DELETE FROM transactions')
    testDb.exec('DELETE FROM accounts')
    testDb.exec('DELETE FROM users')
    seedBase()
  })

  async function seedReview() {
    insertTx('t1', {
      source: 'qif',
      amount: 42.5,
      name: 'Local Groceries',
      date: '2025-01-15',
      category: '["Groceries"]',
      notes: 'keep me',
    })
    insertTx('t2', {
      source: 'plaid',
      amount: 42.5,
      name: 'Safeway Market',
      date: '2025-01-15',
      plaidTransactionId: 'p1',
    })
    await recordMatchReview({
      userId: 'u1',
      accountId: 'a1',
      localTransactionId: 't1',
      onlineTransactionId: 'p1',
    })
    const [review] = testDb
      .prepare('SELECT * FROM transaction_match_reviews')
      .all() as Array<{ id: string }>
    return review.id
  }

  it('merge attaches the online id, enriches fields, and deletes the duplicate row', async () => {
    const reviewId = await seedReview()
    const ok = await resolveMatchReview('u1', reviewId, 'merge')
    expect(ok).toBe(true)

    const rows = testDb.prepare('SELECT * FROM transactions ORDER BY id').all() as Array<{
      id: string
      name: string
      plaid_transaction_id: string | null
      source: string
      category: string | null
      notes: string | null
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe('t1')
    expect(rows[0]!.name).toBe('Safeway Market')
    expect(rows[0]!.plaid_transaction_id).toBe('p1')
    expect(rows[0]!.source).toBe('qif')
    expect(rows[0]!.category).toBe('["Groceries"]')
    expect(rows[0]!.notes).toBe('keep me')

    const [review] = testDb.prepare('SELECT * FROM transaction_match_reviews').all() as Array<{
      status: string
    }>
    expect(review.status).toBe('merged')
  })

  it('dismiss keeps both rows and records the decision', async () => {
    const reviewId = await seedReview()
    const ok = await resolveMatchReview('u1', reviewId, 'dismiss')
    expect(ok).toBe(true)
    expect(testDb.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual({ n: 2 })
    const [review] = testDb.prepare('SELECT * FROM transaction_match_reviews').all() as Array<{
      status: string
    }>
    expect(review.status).toBe('dismissed')
  })

  it('refuses to act for another user or on an already-resolved review', async () => {
    const reviewId = await seedReview()
    expect(await resolveMatchReview('other-user', reviewId, 'merge')).toBe(false)
    expect(await resolveMatchReview('u1', reviewId, 'dismiss')).toBe(true)
    expect(await resolveMatchReview('u1', reviewId, 'merge')).toBe(false)
  })
})
