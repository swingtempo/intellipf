import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PieChart as PieIcon, RefreshCw, Settings2 } from 'lucide-react'
import { getPortfolioData, syncStockPrices } from '#/server/api/portfolio'
import { getSecurityAllocations, updateSecurityAllocation, deleteSecurityAllocation, syncAssetAllocationsFn } from '#/server/api/allocations'
import type { AssetAllocation as AssetAllocationType } from '#/server/services/allocations'
import { PageHeader } from '../components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { StatCard } from '../components/ui/stat-card'
import { DonutChart } from '../components/charts/donut-chart'
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/table'
import { EmptyState } from '../components/ui/empty-state'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
import { formatCurrency, formatDate, formatPercent } from '#/lib/format'
import type { AssetAllocation } from '#/server/services/allocations'

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

const ASSET_CLASSES: Array<{ value: string; label: string }> = [
  { value: 'Equity', label: 'Equity' },
  { value: 'Fixed Income', label: 'Fixed Income' },
  { value: 'Cash & Equivalents', label: 'Cash & Equivalents' },
  { value: 'Real Estate', label: 'Real Estate' },
  { value: 'Commodities', label: 'Commodities' },
  { value: 'Alternative', label: 'Alternative' },
  { value: 'Other', label: 'Other' },
]

function PortfolioPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const data = Route.useLoaderData()
  const [syncing, setSyncing] = useState(false)
  const [allocDialogOpen, setAllocDialogOpen] = useState(false)
  const [syncingAllocations, setSyncingAllocations] = useState(false)
  const [customAllocations, setCustomAllocations] = useState<Map<string, AssetAllocation[]>>(new Map())
  const [savingTicker, setSavingTicker] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState('')

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

  async function loadCustomAllocations() {
    const result = await getSecurityAllocations()
    const map = new Map<string, AssetAllocation[]>()
    for (const item of result) {
      if (item.allocations.length > 0) {
        map.set(item.ticker.toUpperCase(), item.allocations)
      }
    }
    setCustomAllocations(map)
  }

  function getEffectiveAllocations(ticker: string): AssetAllocation[] {
    const upper = ticker.toUpperCase()
    if (customAllocations.has(upper)) {
      return customAllocations.get(upper)!
    }
    // Find from portfolio entries
    for (const entry of data.allocations.entries) {
      if (entry.ticker === upper) {
        return entry.allocations
      }
    }
    return []
  }

  function updateAllocation(ticker: string, index: number, assetClass: AssetAllocationType['assetClass']) {
    const upper = ticker.toUpperCase()
    setCustomAllocations((prev) => {
      const next = new Map(prev)
      const allocations = next.get(upper) ?? getEffectiveAllocations(ticker)
      const updated = [...allocations]
      updated[index] = { ...updated[index], assetClass }
      next.set(upper, updated)
      return next
    })
  }

  function addAllocation(ticker: string) {
    const upper = ticker.toUpperCase()
    setCustomAllocations((prev) => {
      const next = new Map(prev)
      const allocations = next.get(upper) ?? getEffectiveAllocations(ticker)
      next.set(upper, [...allocations, { assetClass: 'Equity', weight: 1 }])
      return next
    })
  }

  function removeAllocation(ticker: string, index: number) {
    const upper = ticker.toUpperCase()
    setCustomAllocations((prev) => {
      const next = new Map(prev)
      const allocations = next.get(upper) ?? getEffectiveAllocations(ticker)
      if (allocations.length <= 1) {
        next.delete(upper)
      } else {
        next.set(upper, allocations.filter((_, i) => i !== index))
      }
      return next
    })
  }

  function updateWeight(ticker: string, index: number, weight: number) {
    const upper = ticker.toUpperCase()
    setCustomAllocations((prev) => {
      const next = new Map(prev)
      const allocations = next.get(upper) ?? getEffectiveAllocations(ticker)
      const updated = [...allocations]
      updated[index] = { ...updated[index], weight }
      next.set(upper, updated)
      return next
    })
  }

  async function handleSaveAllocation(ticker: string) {
    const upper = ticker.toUpperCase()
    const allocations = customAllocations.get(upper)
    if (!allocations || allocations.length === 0) return
    setSavingTicker(upper)
    try {
      await updateSecurityAllocation({ data: { ticker: upper, allocations } })
      await loadCustomAllocations()
    } finally {
      setSavingTicker(null)
    }
  }

  async function handleDeleteAllocation(ticker: string) {
    const upper = ticker.toUpperCase()
    try {
      await deleteSecurityAllocation({ data: { ticker: upper } })
      await loadCustomAllocations()
    } catch {
      // ignore
    }
  }

  async function handleSyncAllocations() {
    setSyncingAllocations(true)
    setSyncMessage('')
    try {
      const tickers = Array.from(new Set(data.holdings.map((h) => h.ticker).filter(Boolean))) as string[]
      const result = await syncAssetAllocationsFn({ data: { tickers } })
      if (result.synced > 0) {
        setSyncMessage(t('portfolio.allocationsSynced', { count: result.synced }))
        await loadCustomAllocations()
        await router.invalidate()
      } else {
        setSyncMessage(t('portfolio.noProvidersAvailable'))
      }
    } finally {
      setSyncingAllocations(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('portfolio.title')} subtitle={t('portfolio.subtitle')}>
        <div className="flex gap-2">
          <Button onClick={() => { loadCustomAllocations(); setAllocDialogOpen(true) }} variant="outline" disabled={!data.holdings.length}>
            <Settings2 className="h-4 w-4" />
            {t('portfolio.manageAllocations')}
          </Button>
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
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(79,184,178,0.14)] text-xs font-bold text-[var(--lagoon-deep)]">
                          {(holding.ticker || '?').slice(0, 3).toUpperCase()}
                        </span>
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
                                {alloc.assetClass} · {Math.round(alloc.weight * 100)}%
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

      <Dialog
        open={allocDialogOpen}
        onClose={() => setAllocDialogOpen(false)}
        title={t('portfolio.manageTitle')}
        className="max-w-2xl"
      >
        {data.holdings.length === 0 ? (
          <p className="text-[var(--sea-ink-soft)]">{t('portfolio.noCustomAllocations')}</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Button
                size="sm"
                loading={syncingAllocations}
                onClick={handleSyncAllocations}
                variant="outline"
              >
                <RefreshCw className={`h-4 w-4 ${syncingAllocations ? 'animate-spin' : ''}`} />
                {syncingAllocations ? t('portfolio.syncingAllocations') : t('portfolio.syncAllocations')}
              </Button>
              {syncMessage && (
                <span className="text-sm text-[var(--lagoon-deep)]">{syncMessage}</span>
              )}
            </div>
            <div className="space-y-4">
            {Array.from(new Set(data.holdings.map((h) => h.ticker))).map((ticker) => {
              const upper = ticker?.toUpperCase() ?? ''
              if (!upper) return null
              const allocations = customAllocations.get(upper) ?? getEffectiveAllocations(ticker)
              const isCustom = customAllocations.has(upper)

              return (
                <div key={upper} className="rounded-xl border border-[var(--line)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold">{upper}</span>
                      {isCustom && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-[rgba(79,184,178,0.14)] px-2 py-0.5 text-xs font-medium text-[var(--lagoon-deep)]">
                          {t('portfolio.userDefined')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {isCustom && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteAllocation(ticker)}
                        >
                          {t('portfolio.resetToDefault')}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {allocations.map((alloc, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <select
                          value={alloc.assetClass}
                          onChange={(e) => updateAllocation(ticker, idx, e.target.value as AssetAllocationType['assetClass'])}
                          className="h-9 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-sm text-[var(--sea-ink)]"
                        >
                          {ASSET_CLASSES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={alloc.weight * 100}
                          onChange={(e) => updateWeight(ticker, idx, parseFloat(e.target.value) / 100)}
                          className="h-9 w-24 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-right text-sm text-[var(--sea-ink)]"
                        />
                        <span className="text-sm text-[var(--sea-ink-soft)]">%</span>
                        {allocations.length > 1 && (
                          <button
                            onClick={() => removeAllocation(ticker, idx)}
                            className="rounded p-1.5 text-[var(--sea-ink-soft)] transition hover:bg-red-50 hover:text-red-500"
                            title={t('common.delete')}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <Button size="sm" variant="ghost" onClick={() => addAllocation(ticker)}>
                      + {t('portfolio.addAllocation')}
                    </Button>
                    {isCustom && (
                      <Button
                        size="sm"
                        loading={savingTicker === upper}
                        onClick={() => handleSaveAllocation(ticker)}
                      >
                        {t('common.save')}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
    </>
        )}
      </Dialog>
    </main>
  )
}
