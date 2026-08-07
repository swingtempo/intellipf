import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, RefreshCw } from 'lucide-react'
import { listAccounts, getAccountTransactions } from '#/server/api/accounts'
import { listMatchReviews, resolveMatchReview, syncAccount } from '#/server/api/plaid'
import { PageHeader } from '../../components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui/table'
import { formatCurrency, formatDate, titleCase } from '#/lib/format'

export const Route = createFileRoute('/accounts/$accountId')({
  loader: async ({ params }) => {
    const [accounts, transactions, reviews] = await Promise.all([
      listAccounts(),
      getAccountTransactions({ data: { accountId: params.accountId, limit: 200, offset: 0 } }),
      listMatchReviews({ data: { accountId: params.accountId } }),
    ])
    return {
      account: accounts.find((a) => a.id === params.accountId),
      transactions,
      reviews,
    }
  },
  component: AccountDetailPage,
})

function AccountDetailPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { account, transactions, reviews } = Route.useLoaderData()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{
    added: number
    modified: number
    removed: number
    merged: number
    review: number
    [key: string]: number
  } | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  async function doSync() {
    if (!account) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await syncAccount({ data: { accountId: account.id } })
      setSyncResult(result.transactions)
      await router.invalidate()
    } finally {
      setSyncing(false)
    }
  }

  async function doResolve(reviewId: string, action: 'merge' | 'dismiss') {
    setResolvingId(reviewId)
    try {
      await resolveMatchReview({ data: { reviewId, action } })
      await router.invalidate()
    } finally {
      setResolvingId(null)
    }
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <Link
        to="/accounts"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--lagoon-deep)] no-underline"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('nav.accounts')}
      </Link>

      {!account ? (
        <EmptyState title={t('common.none')} />
      ) : (
        <>
          <PageHeader
            title={account.name}
            subtitle={`${account.institutionName ?? ''}${account.mask ? ` · •••• ${account.mask}` : ''} · ${titleCase(account.subtype ?? account.type)}`}
          >
            {account.plaidItemId && (
              <Button variant="outline" onClick={() => void doSync()} loading={syncing}>
                <RefreshCw className="h-4 w-4" />
                {syncing ? t('accounts.syncing') : t('accounts.syncNow')}
              </Button>
            )}
            <Badge tone="info">{t('common.balance')}: {formatCurrency(account.balance ?? 0, account.currency)}</Badge>
          </PageHeader>

          {syncResult && (
            <div className="mb-6 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink-soft)]">
              {t('accounts.syncSummary', syncResult)}
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--sea-ink-soft)]">
                  {t('common.balance')}
                </p>
                <p className="mt-1 text-2xl font-bold text-[var(--sea-ink)]">
                  {formatCurrency(account.balance ?? 0, account.currency)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--sea-ink-soft)]">
                  {t('accounts.available')}
                </p>
                <p className="mt-1 text-2xl font-bold text-[var(--sea-ink)]">
                  {account.available != null
                    ? formatCurrency(account.available, account.currency)
                    : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--sea-ink-soft)]">
                  {t('transactions.title')}
                </p>
                <p className="mt-1 text-2xl font-bold text-[var(--sea-ink)]">{transactions.total}</p>
              </CardContent>
            </Card>
          </div>

          {reviews.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>{t('accounts.reviewMatches')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-[var(--sea-ink-soft)]">{t('accounts.matchHint')}</p>
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="flex flex-col gap-3 rounded-xl border border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-[var(--sea-ink-soft)]">
                            {t('transactions.source')} · {review.local?.source ?? '—'}
                          </p>
                          <p className="mt-0.5 font-semibold text-[var(--sea-ink)]">
                            {review.local?.name ?? '—'}
                          </p>
                          <p className="text-xs text-[var(--sea-ink-soft)]">
                            {review.local ? formatDate(review.local.date) : '—'} ·{' '}
                            {review.local ? formatCurrency(review.local.amount, review.local.currencyCode) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-[var(--sea-ink-soft)]">
                            {t('transactions.source')} · plaid
                          </p>
                          <p className="mt-0.5 font-semibold text-[var(--sea-ink)]">
                            {review.online?.name ?? '—'}
                          </p>
                          <p className="text-xs text-[var(--sea-ink-soft)]">
                            {review.online ? formatDate(review.online.date) : '—'} ·{' '}
                            {review.online ? formatCurrency(review.online.amount, review.online.currencyCode) : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => void doResolve(review.id, 'merge')}
                          loading={resolvingId === review.id}
                        >
                          {t('accounts.merge')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void doResolve(review.id, 'dismiss')}
                          loading={resolvingId === review.id}
                        >
                          {t('accounts.keepBoth')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t('transactions.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.rows.length === 0 ? (
                <EmptyState title={t('dashboard.noTransactions')} />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('common.date')}</TH>
                      <TH>{t('common.name')}</TH>
                      <TH>{t('common.category')}</TH>
                      <TH className="text-right">{t('common.amount')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {transactions.rows.map((tx) => (
                      <TR key={tx.id}>
                        <TD className="whitespace-nowrap text-[var(--sea-ink-soft)]">{formatDate(tx.date)}</TD>
                        <TD className="font-semibold">{tx.name}</TD>
                        <TD>
                          <Badge tone="neutral">{tx.category[0] ?? t('common.none')}</Badge>
                        </TD>
                        <TD className="text-right">
                          <span className={`inline-flex items-center gap-1 font-bold ${tx.amount < 0 ? 'text-[var(--palm)]' : ''}`}>
                            {tx.amount < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                            {formatCurrency(tx.amount, tx.currency)}
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  )
}
