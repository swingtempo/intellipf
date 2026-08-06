import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, ChevronLeft } from 'lucide-react'
import { getSecurityDetail } from '#/server/api/securities'
import { PageHeader } from '../../components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { EmptyState } from '../../components/ui/empty-state'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui/table'
import { LineChart } from '../../components/charts/line-chart'
import { formatCurrency, formatDate, titleCase } from '#/lib/format'

export const Route = createFileRoute('/security/$ticker')({
  loader: async ({ params }) => {
    const ticker = params.ticker.toUpperCase()
    return getSecurityDetail({ data: { ticker } })
  },
  errorComponent: () => <EmptyState title="Security not found" />,
  component: SecurityPricePage,
})

function SecurityPricePage() {
  const { t } = useTranslation()
  const security = Route.useLoaderData()

  const latestPrice = security.latestPrice
  const priceHistory = security.priceHistory

  const chartData = priceHistory.map((p) => ({
    label: formatDate(p.date, 'MMM d'),
    price: p.price,
  }))

  const firstPrice = priceHistory[0]?.price
  const lastPrice = priceHistory[priceHistory.length - 1]?.price
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
          <CardTitle>{t('portfolio.priceHistory')}</CardTitle>
        </CardHeader>
        <CardContent>
          {priceHistory.length === 0 ? (
            <EmptyState title={t('security.noPriceData')} />
          ) : (
            <LineChart
              data={chartData}
              series={[{ key: 'price', name: t('portfolio.price'), color: 'var(--lagoon-deep)' }]}
              formatValue={(v) => formatCurrency(v, security.currency)}
            />
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('portfolio.priceHistory')} — {priceHistory.length} {t('common.dates')}</CardTitle>
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
