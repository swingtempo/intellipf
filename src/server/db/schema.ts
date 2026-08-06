import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    email: text('email'),
    emailVerified: integer('email_verified'),
    image: text('image'),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
)

export const sessions = sqliteTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires').notNull(),
})

export const oauthAccounts = sqliteTable('oauth_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
})

export const verificationTokens = sqliteTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: integer('expires').notNull(),
})

export const authenticators = sqliteTable('authenticators', {
  credentialId: text('credential_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  providerAccountId: text('provider_account_id').notNull(),
  credentialPublicKey: text('credential_public_key').notNull(),
  counter: integer('counter').notNull(),
  credentialDeviceType: text('credential_device_type').notNull(),
  credentialBackedUp: integer('credential_backed_up').notNull(),
  transports: text('transports'),
})

export type PlaidItemStatus = 'active' | 'error' | 'invalid' | 'removed'

export const plaidItems = sqliteTable(
  'plaid_items',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plaidItemId: text('plaid_item_id').notNull(),
    accessToken: text('access_token').notNull(),
    institutionId: text('institution_id'),
    institutionName: text('institution_name'),
    cursor: text('cursor'),
    status: text('status').$type<PlaidItemStatus>().notNull().default('active'),
    error: text('error'),
    lastSyncAt: text('last_sync_at'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [uniqueIndex('plaid_items_plaid_item_id_unique').on(table.plaidItemId)],
)

export const accountTypes = [
  'depository',
  'credit',
  'loan',
  'investment',
  'brokerage',
  'insurance',
  'other',
] as const

export type AccountType = (typeof accountTypes)[number]

export const accountSources = ['plaid', 'qif', 'manual'] as const
export type AccountSource = (typeof accountSources)[number]

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plaidItemId: text('plaid_item_id').references(() => plaidItems.id, {
      onDelete: 'set null',
    }),
    plaidAccountId: text('plaid_account_id'),
    source: text('source').$type<AccountSource>().notNull().default('plaid'),
    name: text('name').notNull(),
    officialName: text('official_name'),
    type: text('type').$type<AccountType>().notNull().default('other'),
    subtype: text('subtype'),
    mask: text('mask'),
    institutionName: text('institution_name'),
    currencyCode: text('currency_code').notNull().default('USD'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    index('accounts_user_id_idx').on(table.userId),
    index('accounts_plaid_account_id_idx').on(table.plaidAccountId),
  ],
)

export const balances = sqliteTable(
  'balances',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    available: real('available'),
    current: real('current'),
    limit: real('limit'),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('balances_account_date_unique').on(table.accountId, table.date),
    index('balances_user_date_idx').on(table.userId, table.date),
  ],
)

export const transactionSources = ['plaid', 'qif', 'manual'] as const
export type TransactionSource = (typeof transactionSources)[number]

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    plaidTransactionId: text('plaid_transaction_id'),
    source: text('source').$type<TransactionSource>().notNull().default('plaid'),
    amount: real('amount').notNull(),
    name: text('name').notNull(),
    merchantName: text('merchant_name'),
    category: text('category'),
    date: text('date').notNull(),
    currencyCode: text('currency_code').notNull().default('USD'),
    pending: integer('pending', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    index('transactions_user_date_idx').on(table.userId, table.date),
    index('transactions_account_date_idx').on(table.accountId, table.date),
    index('transactions_plaid_id_idx').on(table.plaidTransactionId),
  ],
)

export const securities = sqliteTable(
  'securities',
  {
    id: text('id').primaryKey(),
    ticker: text('ticker'),
    name: text('name'),
    type: text('type').notNull().default('other'),
    currency: text('currency').notNull().default('USD'),
    isin: text('isin'),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [index('securities_ticker_idx').on(table.ticker)],
)

export const holdings = sqliteTable(
  'holdings',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    securityId: text('security_id')
      .notNull()
      .references(() => securities.id, { onDelete: 'cascade' }),
    quantity: real('quantity').notNull().default(0),
    costBasis: real('cost_basis'),
    price: real('price'),
    priceAsOf: text('price_as_of'),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('holdings_account_security_unique').on(table.accountId, table.securityId),
    index('holdings_security_id_idx').on(table.securityId),
  ],
)

export const stockPrices = sqliteTable(
  'stock_prices',
  {
    id: text('id').primaryKey(),
    ticker: text('ticker').notNull(),
    date: text('date').notNull(),
    price: real('price').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('stock_prices_ticker_date_unique').on(table.ticker, table.date),
    index('stock_prices_ticker_idx').on(table.ticker),
  ],
)

export const securityAllocations = sqliteTable(
  'security_allocations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ticker: text('ticker').notNull(),
    allocations: text('allocations').notNull(),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('security_allocations_user_ticker_unique').on(table.userId, table.ticker),
    index('security_allocations_ticker_idx').on(table.ticker),
  ],
)

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    month: text('month').notNull(),
    amount: real('amount').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('budgets_user_category_month_unique').on(
      table.userId,
      table.category,
      table.month,
    ),
    index('budgets_user_month_idx').on(table.userId, table.month),
  ],
)

export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetAmount: real('target_amount').notNull(),
  currentAmount: real('current_amount').notNull().default(0),
  targetDate: text('target_date'),
  icon: text('icon').default('piggy-bank'),
  color: text('color').default('#4fb8b2'),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
})

export const netWorthSnapshots = sqliteTable(
  'net_worth_snapshots',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    totalAssets: real('total_assets').notNull().default(0),
    totalLiabilities: real('total_liabilities').notNull().default(0),
    netWorth: real('net_worth').notNull().default(0),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    uniqueIndex('net_worth_user_date_unique').on(table.userId, table.date),
    index('net_worth_user_date_idx').on(table.userId, table.date),
  ],
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  updatedAt: text('updated_at').notNull().default(now),
})
