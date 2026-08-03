import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Landmark } from 'lucide-react'
import { getNetWorth } from '#/server/api/networth'
import { PageHeader } from '../components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { StatCard } from '../components/ui/stat-card'
import { LineChart } from '../components/charts/line-chart'
import { EmptyState } from '../components/ui/empty-state'
import { formatCurrency } from '#/lib/format'

export const Route = createFileRoute('/net-worth')({
  loader: () => getNetWorth({ data: { months: 36 } }),
  component: NetWorthPage,
})

function NetWorthPage() {
  const { t } = useTranslation()
  const data = Route.useLoaderData()

  const last = data[data.length - 1]
  const chartData = data.map((point) => ({
    label: point.date.slice(5),
    [t('networth.assets')]: point.assets,
    [t('networth.liabilities')]: point.liabilities,
    [t('networth.netWorth')]: point.netWorth,
  }))

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('networth.title')} subtitle={t('networth.subtitle')} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t('networth.current')}
          value={formatCurrency(last?.netWorth ?? 0)}
          icon={Landmark}
        />
        <StatCard label={t('networth.assets')} value={formatCurrency(last?.assets ?? 0)} />
        <StatCard label={t('networth.liabilities')} value={formatCurrency(last?.liabilities ?? 0)} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('networth.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <EmptyState title={t('dashboard.noAccounts')} />
          ) : (
            <LineChart
              data={chartData}
              series={[
                { key: t('networth.netWorth'), name: t('networth.netWorth'), color: 'var(--lagoon-deep)' },
                { key: t('networth.assets'), name: t('networth.assets'), color: 'var(--palm)' },
                { key: t('networth.liabilities'), name: t('networth.liabilities'), color: 'var(--coral)' },
              ]}
              formatValue={(v) => formatCurrency(v)}
            />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
