import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, Landmark, PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { getDashboard } from '#/server/api/dashboard'
import { PageHeader } from '../components/page-header'
import { StatCard } from '../components/ui/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { EmptyState } from '../components/ui/empty-state'
import { Sparkline } from '../components/charts/sparkline'
import { formatCurrency, formatDate } from '#/lib/format'

export const Route = createFileRoute('/')({
  loader: () => getDashboard(),
  component: DashboardPage,
})

function DashboardPage() {
  const { t } = useTranslation()
  const data = Route.useLoaderData()

  const series = data.netWorthSeries.map((point) => point.netWorth)

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('dashboard.netWorth')}
          value={formatCurrency(data.netWorth)}
          icon={TrendingUp}
          trend={series.length > 1 ? `+${formatCurrency(Math.max(series[series.length - 1]! - series[0]!, 0))}` : undefined}
          trendDirection={series[series.length - 1]! >= series[0]! ? 'up' : 'down'}
        />
        <StatCard label={t('dashboard.totalCash')} value={formatCurrency(data.totalCash)} icon={Wallet} />
        <StatCard label={t('dashboard.totalDebt')} value={formatCurrency(data.totalDebt)} icon={TrendingDown} />
        <StatCard label={t('dashboard.investments')} value={formatCurrency(data.investmentValue)} icon={Landmark} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('dashboard.netWorth')}</CardTitle>
            <Badge tone="info">{data.netWorthSeries.length} pts</Badge>
          </CardHeader>
          <CardContent>
            {series.length > 1 ? (
              <div className="overflow-hidden rounded-xl">
                <Sparkline
                  values={series}
                  color="var(--lagoon-deep)"
                  width={720}
                  height={120}
                />
                <div className="mt-2 flex justify-between text-xs text-[var(--sea-ink-soft)]">
                  <span>{data.netWorthSeries[0]?.date}</span>
                  <span>{data.netWorthSeries[data.netWorthSeries.length - 1]?.date}</span>
                </div>
              </div>
            ) : (
              <EmptyState title={t('dashboard.noAccounts')} description={t('accounts.noAccountsHint')} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.budgetsTitle')}</CardTitle>
            <Link to="/budgets" className="text-xs font-semibold text-[var(--lagoon-deep)] no-underline">
              {t('common.viewAll')}
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.budgets.length === 0 && (
              <p className="text-sm text-[var(--sea-ink-soft)]">{t('common.none')}</p>
            )}
            {data.budgets.slice(0, 4).map((budget) => (
              <div key={budget.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-[var(--sea-ink)]">{budget.category}</span>
                  <span className="text-xs text-[var(--sea-ink-soft)]">
                    {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                  </span>
                </div>
                <Progress
                  value={budget.progress}
                  tone={budget.progress >= 1 ? 'danger' : budget.progress >= 0.8 ? 'warning' : 'default'}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('dashboard.recentTransactions')}</CardTitle>
            <Link to="/transactions" className="text-xs font-semibold text-[var(--lagoon-deep)] no-underline">
              {t('common.viewAll')}
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentTransactions.length === 0 ? (
              <EmptyState title={t('dashboard.noTransactions')} />
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {data.recentTransactions.map((tx) => (
                  <li key={tx.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                          tx.amount < 0 ? 'bg-[rgba(47,106,74,0.14)]' : 'bg-[rgba(79,184,178,0.14)]'
                        }`}
                      >
                        {tx.amount < 0 ? (
                          <ArrowDownRight className="h-4 w-4 text-[var(--palm)]" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-[var(--lagoon-deep)]" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--sea-ink)]">{tx.name}</p>
                        <p className="truncate text-xs text-[var(--sea-ink-soft)]">
                          {tx.category[0] ?? t('common.none')} · {formatDate(tx.date)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        tx.amount < 0 ? 'text-[var(--palm)]' : 'text-[var(--sea-ink)]'
                      }`}
                    >
                      {formatCurrency(tx.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.goalsTitle')}</CardTitle>
            <Link to="/goals" className="text-xs font-semibold text-[var(--lagoon-deep)] no-underline">
              {t('common.viewAll')}
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.goals.length === 0 && (
              <EmptyState title={t('dashboard.noGoals')} icon={PiggyBank} />
            )}
            {data.goals.slice(0, 4).map((goal) => (
              <div key={goal.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-[var(--sea-ink)]">{goal.name}</span>
                  <span className="text-xs text-[var(--sea-ink-soft)]">
                    {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                  </span>
                </div>
                <Progress
                  value={goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0}
                  tone={goal.currentAmount >= goal.targetAmount ? 'success' : 'default'}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
