import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, ChevronLeft } from 'lucide-react'
import { getSecurityDetail } from '#/server/api/securities'
import { PageHeader } from '../../components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { EmptyState } from '../../components/ui/empty-state'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui/table'
import { LineChart } from '../../components/charts/line-chart'
import type { ChartRange as ImportedChartRange } from '../../components/charts/line-chart'
import { formatCurrency, formatDate, titleCase } from '#/lib/format'

export const Route = createFileRoute('/security/$ticker')({
  loader: async ({ params }) => {
    const ticker = params.ticker.toUpperCase()
    return getSecurityDetail({ data: { ticker } })
  },
  errorComponent: () => <EmptyState title="Security not found" />,
  component: SecurityPricePage,
})

type ChartRange = '1W' | ImportedChartRange

const RANGE_DAYS: Record<ChartRange, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  YTD: Infinity,
  '1Y': 365,
  All: Infinity,
}

function filterByRange(data: Array<{ date: string; price: number }>, range: ChartRange): Array<{ date: string; price: number }> {
  if (range === 'All') return data
  const days = RANGE_DAYS[range]
  const cutoff = new Date()
  if (range === 'YTD') {
    cutoff.setFullYear(new Date().getFullYear(), 0, 1)
  } else {
    cutoff.setDate(cutoff.getDate() - days)
  }
  return data.filter((p) => parseISO(p.date) >= cutoff)
}

function formatChartLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return format(d, 'MM/dd')
}

const CLASS_COLORS: Record<string, string> = {
  Equity: 'var(--lagoon-deep)',
  FixedIncome: 'var(--palm)',
  CashEquivalents: 'var(--coral)',
  RealEstate: '#f5a623',
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

function SecurityPricePage() {
  const { t } = useTranslation()
  const security = Route.useLoaderData()
  const [range, setRange] = useState<ChartRange>('1W')

  const latestPrice = security.latestPrice
  const priceHistory = security.priceHistory
  const visiblePrices = filterByRange(priceHistory, range)

  const chartData = visiblePrices.map((p) => ({
    label: p.date,
    price: p.price,
  }))

  const firstPrice = visiblePrices[0]?.price
  const lastPrice = visiblePrices[visiblePrices.length - 1]?.price
  const change = firstPrice && lastPrice ? lastPrice - firstPrice : null
  const changePercent = firstPrice ? (change ?? 0) / firstPrice : null

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <Link
        to="/portfolio"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--lagoon-deep)] no-underline"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('nav.portfolio')}
      </Link>

      <PageHeader
        title={security.ticker}
        subtitle={`${security.name ?? ''}${security.sector ? ` · ${titleCase(security.sector)}` : ''}${security.industry ? ` · ${titleCase(security.industry)}` : ''}`}
      >
        <div className="flex items-center gap-3">
          {latestPrice != null && (
            <>
              <span className="text-2xl font-bold">{formatCurrency(latestPrice, security.currency)}</span>
              {change != null && (
                <span className={`inline-flex items-center gap-1 text-sm font-semibold ${change >= 0 ? 'text-[var(--palm)]' : 'text-red-500'}`}>
                  {change >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {change >= 0 ? '+' : ''}
                  {formatCurrency(change, security.currency)} ({changePercent != null ? `${(changePercent * 100).toFixed(2)}%` : ''})
                </span>
              )}
            </>
          )}
          {security.type && (
            <Badge tone="info">{titleCase(security.type)}</Badge>
          )}
        </div>
      </PageHeader>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('portfolio.priceHistory')}</CardTitle>
            {priceHistory.length > 0 && (
              <div className="inline-flex rounded-lg border border-[var(--line)] p-0.5 text-xs font-medium">
                {(Object.keys(RANGE_DAYS) as ChartRange[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setRange(opt)}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      range === opt
                        ? 'bg-[var(--lagoon-deep)] text-white'
                        : 'text-[var(--sea-ink-soft)] hover:bg-[var(--surface-visited)]'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {priceHistory.length === 0 ? (
            <EmptyState title={t('security.noPriceData')} />
          ) : (
            <LineChart
              data={chartData}
              series={[{ key: 'price', name: t('portfolio.price'), color: 'var(--lagoon-deep)' }]}
              formatValue={(v) => formatCurrency(v, security.currency)}
              formatLabel={formatChartLabel}
            />
          )}
        </CardContent>
      </Card>

      {security.allocations && security.allocations.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('portfolio.assetAllocation')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {security.allocations.map((alloc, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
                  style={{ backgroundColor: `${CLASS_COLORS[alloc.assetClass.replace(/\s+/g, '')] ?? 'var(--lagoon-deep)'}1a`, color: CLASS_COLORS[alloc.assetClass.replace(/\s+/g, '')] ?? 'var(--lagoon-deep)' }}
                >
                  {t(ASSET_CLASS_I18N[alloc.assetClass] ?? alloc.assetClass)} · {Math.round(alloc.weight * 100)}%
                  {alloc.source === 'user_defined' && (
                    <span className="ml-2 text-xs opacity-60">(custom)</span>
                  )}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('portfolio.priceHistory')} — {priceHistory.length} records</CardTitle>
        </CardHeader>
        <CardContent>
          {priceHistory.length === 0 ? (
            <EmptyState title={t('security.noPriceData')} />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('common.date')}</TH>
                  <TH className="text-right">{t('portfolio.price')}</TH>
                </TR>
              </THead>
              <TBody>
                {[...priceHistory].reverse().map((p) => (
                  <TR key={p.date}>
                    <TD className="whitespace-nowrap text-[var(--sea-ink-soft)]">{formatDate(p.date)}</TD>
                    <TD className="text-right font-bold">
                      {formatCurrency(p.price, security.currency)}
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
