import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, Search } from 'lucide-react'
import { listAccounts } from '#/server/api/accounts'
import { listCategories, searchTransactions } from '#/server/api/transactions'
import { PageHeader } from '../components/page-header'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/table'
import { EmptyState } from '../components/ui/empty-state'
import { formatCurrency, formatDate } from '#/lib/format'

export const Route = createFileRoute('/transactions')({
  loader: async () => {
    const [accounts, categories, firstPage] = await Promise.all([
      listAccounts(),
      listCategories(),
      searchTransactions({ data: { limit: 100, offset: 0 } }),
    ])
    return { accounts, categories, firstPage }
  },
  component: TransactionsPage,
})

function TransactionsPage() {
  const { t } = useTranslation()
  const initial = Route.useLoaderData()
  const [accountId, setAccountId] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState(initial.firstPage.rows)
  const [total, setTotal] = useState(initial.firstPage.total)
  const [offset, setOffset] = useState(initial.firstPage.rows.length)
  const [busy, setBusy] = useState(false)

  const query = useMemo(
    () => ({
      accountId: accountId || undefined,
      category: category || undefined,
      search: search || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [accountId, category, search, from, to],
  )

  async function runSearch(reset: boolean) {
    setBusy(true)
    try {
      const result = await searchTransactions({ data: { ...query, limit: 100, offset: reset ? 0 : offset } })
      setRows(reset ? result.rows : [...rows, ...result.rows])
      setTotal(result.total)
      setOffset(reset ? result.rows.length : offset + result.rows.length)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void runSearch(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, category, from, to])

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('transactions.title')} subtitle={t('transactions.subtitle')} />

      <Card className="mb-6">
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--sea-ink-soft)]" />
            <Input
              className="pl-9"
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runSearch(true)
              }}
            />
          </div>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('transactions.allAccounts')}</option>
            {initial.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('transactions.allCategories')}</option>
            {initial.categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>
          <Button variant="subtle" onClick={() => void runSearch(true)} disabled={busy}>
            {t('common.search')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--sea-ink-soft)]">
              {total} {t('transactions.title')}
            </span>
            <div className="flex gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-xs" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-xs" />
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState title={t('dashboard.noTransactions')} />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>{t('common.date')}</TH>
                    <TH>{t('common.name')}</TH>
                    <TH>{t('accounts.title')}</TH>
                    <TH>{t('common.category')}</TH>
                    <TH className="text-right">{t('common.amount')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((tx) => (
                    <TR key={tx.id}>
                      <TD className="whitespace-nowrap text-[var(--sea-ink-soft)]">{formatDate(tx.date)}</TD>
                      <TD className="font-semibold">{tx.name}</TD>
                      <TD className="text-[var(--sea-ink-soft)]">{tx.accountName}</TD>
                      <TD>
                        <Badge tone="neutral">{tx.category[0] ?? t('common.none')}</Badge>
                      </TD>
                      <TD className="text-right">
                        <span className={`inline-flex items-center gap-1 font-bold ${tx.amount < 0 ? 'text-[var(--palm)]' : ''}`}>
                          {tx.amount < 0 ? (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          )}
                          {formatCurrency(tx.amount, tx.currency)}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {rows.length < total && (
                <div className="mt-4 text-center">
                  <Button variant="outline" onClick={() => void runSearch(false)} loading={busy}>
                    {t('transactions.showMore')}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
