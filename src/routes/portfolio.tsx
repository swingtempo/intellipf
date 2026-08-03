import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PieChart as PieIcon, RefreshCw } from 'lucide-react'
import { getPortfolioData, syncStockPrices } from '#/server/api/portfolio'
import { PageHeader } from '../components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { StatCard } from '../components/ui/stat-card'
import { DonutChart } from '../components/charts/donut-chart'
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/table'
import { EmptyState } from '../components/ui/empty-state'
import { Button } from '../components/ui/button'
import { formatCurrency, formatPercent } from '#/lib/format'

export const Route = createFileRoute('/portfolio')({
  loader: () => getPortfolioData(),
  component: PortfolioPage,
})

const CLASS_COLORS: Record<string, string> = {
  Equity: 'var(--lagoon-deep)',
  'Fixed Income': 'var(--palm)',
  'Cash & Equivalents': 'var(--coral)',
  'Real Estate': '#f5a623',
  Commodities: '#8d6e63',
  Alternative: '#9c27b0',
  Other: '#90a4ae',
}

function PortfolioPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const data = Route.useLoaderData()
  const [syncing, setSyncing] = useState(false)

  const totalGain = data.totalValue - data.totalCost
  const gainPercent = data.totalCost > 0 ? totalGain / data.totalCost : null

  async function handleSync() {
    setSyncing(true)
    try {
      await syncStockPrices()
      await router.invalidate()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('portfolio.title')} subtitle={t('portfolio.subtitle')}>
        <Button onClick={handleSync} loading={syncing} variant="outline" disabled={!data.holdings.length}>
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {t('portfolio.syncPrices')}
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('portfolio.totalValue')} value={formatCurrency(data.totalValue)} icon={PieIcon} />
        <StatCard label={t('portfolio.totalCost')} value={formatCurrency(data.totalCost)} />
        <StatCard
          label={t('portfolio.totalGain')}
          value={`${totalGain >= 0 ? '+' : ''}${formatCurrency(totalGain)}`}
          trendDirection={totalGain >= 0 ? 'up' : 'down'}
        />
        <StatCard
          label={t('portfolio.return')}
          value={gainPercent != null ? formatPercent(gainPercent) : '—'}
          trendDirection={gainPercent != null && gainPercent >= 0 ? 'up' : 'down'}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('portfolio.assetAllocation')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.allocations.assetClasses.length === 0 ? (
            <EmptyState title={t('portfolio.noHoldings')} />
          ) : (
            <DonutChart
              data={data.allocations.assetClasses.map((a) => ({
                label: a.assetClass,
                value: a.value,
                color: CLASS_COLORS[a.assetClass] ?? 'var(--lagoon-deep)',
              }))}
              centerLabel={t('portfolio.totalValue')}
            />
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('portfolio.holdings')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.holdings.length === 0 ? (
            <EmptyState title={t('portfolio.noHoldings')} />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('portfolio.ticker')}</TH>
                  <TH>{t('common.name')}</TH>
                  <TH>{t('accounts.title')}</TH>
                  <TH className="text-right">{t('portfolio.quantity')}</TH>
                  <TH className="text-right">{t('portfolio.price')}</TH>
                  <TH className="text-right">{t('portfolio.costBasis')}</TH>
                  <TH className="text-right">{t('portfolio.marketValue')}</TH>
                  <TH className="text-right">{t('portfolio.gain')}</TH>
                  <TH className="text-right">{t('portfolio.gainPercent')}</TH>
                </TR>
              </THead>
              <TBody>
                {data.holdings.map((holding) => (
                  <TR key={`${holding.accountId}-${holding.securityId}`}>
                    <TD>
                      <span className="inline-flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(79,184,178,0.14)] text-xs font-bold text-[var(--lagoon-deep)]">
                          {(holding.ticker || '?').slice(0, 3).toUpperCase()}
                        </span>
                        <span className="font-bold">{holding.ticker || '—'}</span>
                      </span>
                    </TD>
                    <TD className="text-[var(--sea-ink-soft)]">{holding.name ?? '—'}</TD>
                    <TD className="text-[var(--sea-ink-soft)]">{holding.accountName}</TD>
                    <TD className="text-right">{holding.quantity}</TD>
                    <TD className="text-right">{holding.price != null ? formatCurrency(holding.price) : '—'}</TD>
                    <TD className="text-right">{holding.costBasis != null ? formatCurrency(holding.costBasis) : '—'}</TD>
                    <TD className="text-right font-bold">{formatCurrency(holding.marketValue)}</TD>
                    <TD className="text-right">
                      {holding.gain != null ? (
                        <span className={holding.gain >= 0 ? 'text-[var(--palm)]' : 'text-red-500'}>
                          {holding.gain >= 0 ? '+' : ''}
                          {formatCurrency(holding.gain)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="text-right">
                      {holding.gainPercent != null ? (
                        <span className={holding.gainPercent >= 0 ? 'text-[var(--palm)]' : 'text-red-500'}>
                          {formatPercent(holding.gainPercent)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
