import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
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
import { formatCurrency, formatDate, formatPercent } from '#/lib/format'

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

const ASSET_CLASS_I18N: Record<string, string> = {
  Equity: 'allocations.equity',
  'Fixed Income': 'allocations.fixedIncome',
  'Cash & Equivalents': 'allocations.cashAndEquivalents',
  'Real Estate': 'allocations.realEstate',
  Commodities: 'allocations.commodities',
  Alternative: 'allocations.alternative',
  Other: 'allocations.other',
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
        <div className="flex gap-2">
          <Button onClick={handleSync} loading={syncing} variant="outline" disabled={!data.holdings.length}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {t('portfolio.syncPrices')}
          </Button>
        </div>
      </PageHeader>

      {data.allocationsUpdatedAt || data.priceLastSyncedAt || data.priceSourceBreakdown ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--sea-ink-soft)]">
          {data.allocationsUpdatedAt && (
            <span>{t('portfolio.lastAllocationsSync', { date: formatDate(data.allocationsUpdatedAt) })}</span>
          )}
          {data.allocationsUpdatedAt && data.priceLastSyncedAt && <span className="text-[var(--line)]">·</span>}
          {data.priceLastSyncedAt && (
            <span>{t('portfolio.lastPricesSync', { date: formatDate(data.priceLastSyncedAt) })}</span>
          )}
          {data.priceSourceBreakdown && data.priceSourceBreakdown.yahoo_finance > 0 && (
            <span className="ml-auto flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--lagoon-deep)]" />
              {t('portfolio.priceYahoo', { count: data.priceSourceBreakdown.yahoo_finance })}
            </span>
          )}
          {data.priceSourceBreakdown && data.priceSourceBreakdown.simulated > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--sea-ink-soft)]" />
              {t('portfolio.priceSimulated', { count: data.priceSourceBreakdown.simulated })}
            </span>
          )}
        </div>
      ) : null}

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
                label: t(ASSET_CLASS_I18N[a.assetClass] ?? a.assetClass),
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
                  <TH>{t('portfolio.allocations')}</TH>
                  <TH>{t('portfolio.allocationSource')}</TH>
                </TR>
              </THead>
              <TBody>
                {data.holdings.map((holding) => (
                  <TR key={`${holding.accountId}-${holding.securityId}`}>
                    <TD className="whitespace-nowrap">
                      <Link
                        to="/security/$ticker"
                        params={{ ticker: holding.ticker ?? '' }}
                        className="inline-flex items-center gap-2 no-underline"
                      >
                        <span className="font-bold hover:text-[var(--lagoon-deep)]">{holding.ticker || '—'}</span>
                      </Link>
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
                    <TD className="align-top">
                      {(() => {
                        const entry = data.allocations.entries.find((e) => e.securityId === holding.securityId)
                        if (!entry || entry.allocations.length === 0) return null
                        return (
                          <div className="flex flex-wrap gap-1">
                            {entry.allocations.map((alloc, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
                                style={{ backgroundColor: `${CLASS_COLORS[alloc.assetClass] ?? 'var(--lagoon-deep)'}1a`, color: CLASS_COLORS[alloc.assetClass] ?? 'var(--lagoon-deep)' }}
                              >
                                {t(ASSET_CLASS_I18N[alloc.assetClass] ?? alloc.assetClass)} · {Math.round(alloc.weight * 100)}%
                              </span>
                            ))}
                          </div>
                        )
                      })()}
                    </TD>
                    <TD>
                      {(() => {
                        const entry = data.allocations.entries.find((e) => e.securityId === holding.securityId)
                        if (!entry) return null
                        const labels: Record<string, string> = {
                          user_defined: t('portfolio.userDefined'),
                          allocation_provider: t('portfolio.apiProvider'),
                          fallback: t('portfolio.fallback'),
                        }
                        return (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: entry.source === 'user_defined' ? 'rgba(79,184,178,0.14)' : entry.source === 'allocation_provider' ? 'rgba(245,166,35,0.14)' : 'rgba(144,164,174,0.14)', color: entry.source === 'user_defined' ? 'var(--lagoon-deep)' : entry.source === 'allocation_provider' ? '#f5a623' : 'var(--sea-ink-soft)' }}>
                            {labels[entry.source]}
                          </span>
                        )
                      })()}
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
