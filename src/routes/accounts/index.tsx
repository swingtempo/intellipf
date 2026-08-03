import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Landmark, Plus, Wallet, CreditCard, PieChart, FileUp } from 'lucide-react'
import { listAccounts } from '#/server/api/accounts'
import { plaidStatus } from '#/server/api/plaid'
import { PageHeader } from '../../components/page-header'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { EmptyState } from '../../components/ui/empty-state'
import { PlaidLinkButton } from '../../components/plaid-link'
import { formatCurrency, titleCase } from '#/lib/format'

export const Route = createFileRoute('/accounts/')({
  loader: async () => {
    const [accounts, plaid] = await Promise.all([listAccounts(), plaidStatus()])
    return { accounts, plaid }
  },
  component: AccountsPage,
})

const TYPE_ICONS = {
  depository: Wallet,
  credit: CreditCard,
  loan: CreditCard,
  brokerage: PieChart,
  investment: PieChart,
  insurance: Landmark,
  other: Landmark,
} as const

function groupLabel(type: string): string {
  if (type === 'depository') return 'Depository'
  if (type === 'credit' || type === 'loan') return 'Credit & Loans'
  if (type === 'brokerage' || type === 'investment') return 'Investments'
  return 'Other'
}

function AccountsPage() {
  const { t } = useTranslation()
  const { accounts, plaid } = Route.useLoaderData()

  const grouped = new Map<string, typeof accounts>()
  for (const account of accounts) {
    const key = groupLabel(account.type)
    const list = grouped.get(key) ?? []
    list.push(account)
    grouped.set(key, list)
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('accounts.title')} subtitle={t('accounts.subtitle')}>
        {plaid.configured && <PlaidLinkButton />}
        <Link
          to="/settings"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)]"
        >
          <FileUp className="h-4 w-4" />
          {t('accounts.importQif')}
        </Link>
      </PageHeader>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={t('accounts.noAccounts')}
          description={t('accounts.noAccountsHint')}
          action={
            <div className="flex gap-2">
              {plaid.configured && <PlaidLinkButton />}
              <Link
                to="/settings"
                className="inline-flex h-10 items-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:text-[var(--lagoon-deep)]"
              >
                <FileUp className="mr-2 h-4 w-4" />
                {t('accounts.importQif')}
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([label, group]) => {
            const Icon = TYPE_ICONS[group[0]!.type as keyof typeof TYPE_ICONS] ?? Landmark
            const total = group.reduce((sum, a) => sum + (a.balance ?? 0), 0)
            return (
              <div key={label}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-base font-bold text-[var(--sea-ink)]">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(79,184,178,0.14)] text-[var(--lagoon-deep)]">
                      <Icon className="h-4 w-4" />
                    </span>
                    {label}
                  </h2>
                  <span className="text-sm font-semibold text-[var(--sea-ink-soft)]">
                    {formatCurrency(total)}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((account) => (
                    <Link
                      key={account.id}
                      to="/accounts/$accountId"
                      params={{ accountId: account.id }}
                      className="no-underline"
                    >
                      <Card className="h-full transition hover:border-[var(--lagoon-deep)]">
                        <CardContent>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-bold text-[var(--sea-ink)]">{account.name}</p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--sea-ink-soft)]">
                                {account.institutionName ?? t('common.none')}
                                {account.mask && ` · ${account.mask}`}
                              </p>
                            </div>
                            <Badge tone={account.type === 'credit' || account.type === 'loan' ? 'neutral' : 'success'}>
                              {titleCase(account.subtype ?? account.type)}
                            </Badge>
                          </div>
                          <p className="mt-4 text-xl font-bold text-[var(--sea-ink)]">
                            {formatCurrency(account.balance ?? 0, account.currency)}
                          </p>
                          {account.available != null && (
                            <p className="mt-0.5 text-xs text-[var(--sea-ink-soft)]">
                              {t('accounts.available')}: {formatCurrency(account.available, account.currency)}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
