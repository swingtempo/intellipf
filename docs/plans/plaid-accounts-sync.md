# Plan: Plaid account linking, manual sync UX, and local/online transaction dedup

## Context

The app already has: Plaid Link (`PlaidLinkButton`), item exchange + account fetch (`exchangePublicToken`/`fetchAccountsForItem`), full sync (`syncAllPlaidForUser`), and a per-item sync button on Settings. The gaps:

1. **Dedup is Plaid-only.** `upsertPlaidTransaction` matches by `plaid_transaction_id`, so Plaid transactions don't duplicate each other — but a QIF-imported or manual transaction for a linked account has no Plaid ID, so a Plaid sync inserts a second copy of the same real-world transaction. No local↔online correlation logic exists.
2. **Settings "Sync now" button calls `syncAll()` (global)** instead of syncing the clicked item (settings.tsx:93). `syncAll` is also a **GET** server fn doing writes (api/plaid.ts:36).
3. **No sync UX outside Settings.** The Accounts page and account detail page have no manual sync.
4. `removePlaidItem` deletes **all** transactions of an item's accounts, including QIF/manual ones (plaid.ts:521).

## Decisions

- **Correlation storage:** reuse existing `plaid_transaction_id` column (already indexed; no column migration). It *is* the persisted per-transaction correlation; the work is backfilling it onto previously-local rows.
- **Ambiguous matches → user decides:** auto-merge only on high confidence; ambiguous candidates are recorded in a review table and surfaced in a UI where the user merges or keeps both.
- **Sync UX:** "Sync now" on Accounts page header + per-account sync on account detail; fix Settings per-item button to sync the correct item.
- **Manual only** — no auto-sync trigger.

---

## 1. Transaction correlation & dedup

### 1.1 New table `transaction_match_reviews` (schema + migration)

Persists pending/decided correlation candidates so the Plaid cursor can advance without losing data, and dismissals stick.

```ts
export const transactionMatchReviews = sqliteTable('transaction_match_reviews', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  localTransactionId: text('local_transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  onlineTransactionId: text('online_transaction_id').notNull(),   // Plaid transaction_id
  status: text('status').$type<'pending' | 'merged' | 'dismissed'>().notNull().default('pending'),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
}, (table) => [
  uniqueIndex('match_reviews_pair_unique').on(table.localTransactionId, table.onlineTransactionId),
  index('match_reviews_user_status_idx').on(table.userId, table.status),
])
```

Run `npm run db:generate` + `npm run db:migrate` → `drizzle/0005_*.sql`. Mirror this DDL in test fixtures.

### 1.2 New service `src/server/services/transactionMatch.ts`

- `normalizeName(name): string` — lowercase, non-alphanumeric → space, collapse whitespace.
- `findLocalMatch(userId, accountId, plaidTx): { transaction, confidence: 'high' | 'low' } | null`
  - Candidates: same `accountId`, same `date`, `abs(amount)` within ±0.01, `plaidTransactionId IS NULL`, `source IN ('qif','manual')` (uses `transactions_account_date_idx`).
  - Exactly one candidate with equal `normalizeName(name)` → **high** confidence (auto-merge).
  - Any candidates but none name-equal → **low** confidence (→ user review).
- `recordMatchReview(...)` / `listPendingReviews(userId, accountId?)` / `resolveMatchReview(...)` helpers.

### 1.3 Rework `upsertPlaidTransaction` (src/server/services/plaid.ts:278)

For each added/modified Plaid tx:
1. **By Plaid ID** (existing path) → update row, return `modified`.
2. **High-confidence local match** → merge: set `plaidTransactionId` on the existing row, enrich `name/merchantName/amount/date/currencyCode/pending` from Plaid, **preserve `category`/`notes` and existing `source`** (QIF row stays QIF). Mark any existing pending review for that pair `merged`. Return `merged` (no new row → no duplicate).
3. **Low-confidence match** → insert the Plaid row (`source='plaid'`) so nothing is lost, AND insert a `transaction_match_reviews` row (`pending`). Return `review`.
4. **No match** → insert new Plaid row (existing path). Return `added`.

`syncTransactionsForItem` return becomes `{ added, modified, removed, merged, review }`. `syncAllPlaidForUser` propagates these. `listPlaidItems` gains a `pendingReviewCount` per item.

### 1.4 Removed-transaction handling (plaid.ts:259)

- Row found by `plaidTransactionId` with `source === 'plaid'` → delete row (+ its review rows).
- Row was a merged local (qif/manual) → **don't delete**: clear `plaidTransactionId`, keep the row. (Source unchanged, so it reverts cleanly to local.)

### 1.5 Fix `removePlaidItem` (plaid.ts:499)

Delete only `source = 'plaid'` transactions for the item's accounts; for merged local rows, clear `plaid_transaction_id` instead of deleting. Delete the item's `transaction_match_reviews` rows.

---

## 2. Server API changes (`src/server/api/plaid.ts`)

- `syncAll` → **POST** (it performs writes).
- `syncItem` POST `{ itemId }` → `fetchAccountsForItem` + `syncTransactionsForItem` + `syncInvestmentHoldingsForItem` for one item, returns counts.
- `syncAccount` POST `{ accountId }` → resolves the account's `plaidItemId`, calls `syncItem`. (Used by account detail page.)
- `listMatchReviews` GET → pending reviews with joined local + online transaction details, grouped by account.
- `resolveMatchReview` POST `{ reviewId, action: 'merge' | 'dismiss' }`
  - `merge`: set `plaidTransactionId` on local row = `onlineTransactionId`, copy enriched fields from the online (Plaid) row, delete the online row, mark review `merged`.
  - `dismiss`: mark review `dismissed` (keep both rows).
- `plaidStatus` gains `pendingReviewCount` (top-level) and per-item counts.

Also add `plaidItemId` to `AccountWithBalance` (src/server/services/queries.ts:22) so account pages can trigger per-account sync; update `queries.test.ts` fixture/assertions if shape is asserted.

---

## 3. UX

### 3.1 Accounts page (`src/routes/accounts/index.tsx`)
- Header: **"Sync now"** button (visible when Plaid configured + items exist) → `syncAll()`, loading state, inline result summary (`X added · Y updated · Z removed · N to review`) + `lastSyncedAt`.
- Account cards: small "Synced <date>" caption; badge `N to review` when that account's item has pending reviews (links to `/accounts/$accountId`).

### 3.2 Account detail (`src/routes/accounts/$accountId.tsx`)
- "Sync" button → `syncAccount`, inline result summary.
- **Review matches** section (when `listMatchReviews` returns pending rows for the account): for each, show local tx vs. online tx (date, amount, name, merchant), with **Merge** and **Keep both** buttons → `resolveMatchReview`, then `router.invalidate()`.

### 3.3 Settings (`src/routes/settings.tsx`)
- Per-item button calls `syncItem(item.id)` (not `syncAll`), shows that item's added/modified/removed/merged/review counts and refreshed `lastSyncAt`.

---

## 4. i18n (`src/i18n/locales/en.json`)

Add under `accounts`/`settings`/`plaid`: `syncNow`, `syncing`, `syncedAt`, `added`, `updated`, `removed`, `merged`, `toReview`, `reviewMatches`, `merge`, `keepBoth`, `noMatchesToReview`, `matchHint`, `lastSynced`.

---

## 5. Tests (AGENTS.md hard rule)

- **`src/server/services/transactionMatch.test.ts`** — `normalizeName`; high/low/no-confidence matching; no cross-account or cross-date false positives; amount tolerance (±0.01 abs).
- **`src/server/services/plaid.test.ts`** (new; none exists today) — in-memory DB mirroring production DDL **including** `transaction_match_reviews`; mock `transactionsSync` via `vi.fn()` in exact call order:
  - tx with existing `plaidTransactionId` → update, no dup.
  - high-confidence local match → merged into one row, `plaid_transaction_id` set, category/notes preserved, no new row.
  - low-confidence → Plaid row inserted + `pending` review row created.
  - no match → new Plaid row.
  - removed: plaid row deleted; merged local row kept with id cleared.
  - idempotency: run sync twice → no duplicate rows.
- **`src/server/api/plaid.test.ts`** — `syncItem`/`resolveMatchReview` user scoping + merge/dismiss persistence (mirror `plans.test.ts` style).
- Update `queries.test.ts` fixture if `AccountWithBalance` gains `plaidItemId`.

Pre-existing typecheck errors in `qif.test.ts`, `monteCarlo.test.ts`, `sqlRunner.test.ts` are out of scope.

---

## 6. Files touched

| File | Action |
|---|---|
| `src/server/db/schema.ts` | Add `transactionMatchReviews` table |
| `drizzle/0005_*.sql` | New migration (generated) |
| `src/server/services/transactionMatch.ts` | **New** — matching + review helpers |
| `src/server/services/plaid.ts` | Dedup/merge/review logic; counts; removed + removeItem fixes |
| `src/server/api/plaid.ts` | `syncItem`, `syncAccount`, `listMatchReviews`, `resolveMatchReview`, `syncAll`→POST, status counts |
| `src/server/services/queries.ts` | Add `plaidItemId` to `AccountWithBalance` |
| `src/routes/accounts/index.tsx` | Sync button, synced caption, review badge |
| `src/routes/accounts/$accountId.tsx` | Sync button + review-matches section |
| `src/routes/settings.tsx` | Per-item sync → `syncItem`, per-item results |
| `src/i18n/locales/en.json` | New keys |
| Tests | `transactionMatch.test.ts`, `plaid.test.ts` (service + api), fixture updates |

## 7. Verification

```
npm run db:generate && npm run db:migrate
npm run typecheck
npm test
npm run dev   # manual: link bank → sync → QIF import → sync again, confirm no dups
```
