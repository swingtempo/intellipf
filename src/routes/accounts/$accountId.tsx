import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, ChevronLeft } from 'lucide-react'
import { listAccounts } from '#/server/api/accounts'
import { getAccountTransactions } from '#/server/api/accounts'
import { PageHeader } from '../../components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { EmptyState } from '../../components/ui/empty-state'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui/table'
import { formatCurrency, formatDate, titleCase } from '#/lib/format'

export const Route = createFileRoute('/accounts/$accountId')({
  loader: async ({ params }) => {
    const [accounts, transactions] = await Promise.all([
      listAccounts(),
      getAccountTransactions({ data: { accountId: params.accountId, limit: 200, offset: 0 } }),
    ])
    return {
      account: accounts.find((a) => a.id === params.accountId),
      transactions,
    }
  },
  component: AccountDetailPage,
})

function AccountDetailPage() {
  const { t } = useTranslation()
  const { account, transactions } = Route.useLoaderData()

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
            <Badge tone="info">{t('common.balance')}: {formatCurrency(account.balance ?? 0, account.currency)}</Badge>
          </PageHeader>

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
