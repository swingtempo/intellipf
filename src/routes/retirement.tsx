import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play } from 'lucide-react'
import { getRetirementProjection } from '#/server/api/retirement'
import { PageHeader } from '../components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input, Label } from '../components/ui/input'
import { StatCard } from '../components/ui/stat-card'
import { LineChart } from '../components/charts/line-chart'
import { formatCurrency, formatPercent } from '#/lib/format'

export const Route = createFileRoute('/retirement')({
  component: RetirementPage,
})

const DEFAULTS = {
  currentAge: 30,
  retirementAge: 65,
  lifeExpectancy: 92,
  currentSavings: 50000,
  monthlyContribution: 600,
  monthlyWithdrawal: 3000,
  expectedReturn: 0.07,
  volatility: 0.15,
  inflation: 0.03,
  simulationCount: 1000,
}

interface FormState {
  currentAge: string
  retirementAge: string
  lifeExpectancy: string
  currentSavings: string
  monthlyContribution: string
  monthlyWithdrawal: string
  expectedReturn: string
  volatility: string
  inflation: string
  simulationCount: string
}

function RetirementPage() {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>({
    currentAge: String(DEFAULTS.currentAge),
    retirementAge: String(DEFAULTS.retirementAge),
    lifeExpectancy: String(DEFAULTS.lifeExpectancy),
    currentSavings: String(DEFAULTS.currentSavings),
    monthlyContribution: String(DEFAULTS.monthlyContribution),
    monthlyWithdrawal: String(DEFAULTS.monthlyWithdrawal),
    expectedReturn: String(DEFAULTS.expectedReturn * 100),
    volatility: String(DEFAULTS.volatility * 100),
    inflation: String(DEFAULTS.inflation * 100),
    simulationCount: String(DEFAULTS.simulationCount),
  })
  const [result, setResult] = useState<Awaited<ReturnType<typeof getRetirementProjection>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const result = await getRetirementProjection({ data: { currentAge: Number(form.currentAge), retirementAge: Number(form.retirementAge), lifeExpectancy: Number(form.lifeExpectancy), currentSavings: Number(form.currentSavings), monthlyContribution: Number(form.monthlyContribution), monthlyWithdrawal: Number(form.monthlyWithdrawal), expectedReturn: Number(form.expectedReturn) / 100, volatility: Number(form.volatility) / 100, inflation: Number(form.inflation) / 100, simulationCount: Number(form.simulationCount) || 1000 } })
      setResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const chartData =
    result?.series.map((point) => ({
      label: String(point.age),
      p5: point.p5,
      p50: point.p50,
      p95: point.p95,
    })) ?? []

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('retirement.title')} subtitle={t('retirement.subtitle')} />

      <Card className="mb-6">
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>{t('retirement.currentAge')}</Label>
            <Input type="number" value={form.currentAge} onChange={(e) => setField('currentAge', e.target.value)} />
          </div>
          <div>
            <Label>{t('retirement.retirementAge')}</Label>
            <Input type="number" value={form.retirementAge} onChange={(e) => setField('retirementAge', e.target.value)} />
          </div>
          <div>
            <Label>{t('retirement.lifeExpectancy')}</Label>
            <Input type="number" value={form.lifeExpectancy} onChange={(e) => setField('lifeExpectancy', e.target.value)} />
          </div>
          <div>
            <Label>{t('retirement.currentSavings')}</Label>
            <Input type="number" value={form.currentSavings} onChange={(e) => setField('currentSavings', e.target.value)} />
          </div>
          <div>
            <Label>{t('retirement.monthlyContribution')}</Label>
            <Input type="number" value={form.monthlyContribution} onChange={(e) => setField('monthlyContribution', e.target.value)} />
          </div>
          <div>
            <Label>{t('retirement.monthlyWithdrawal')}</Label>
            <Input type="number" value={form.monthlyWithdrawal} onChange={(e) => setField('monthlyWithdrawal', e.target.value)} />
          </div>
          <div>
            <Label>{t('retirement.expectedReturn')} (%)</Label>
            <Input type="number" step="0.1" value={form.expectedReturn} onChange={(e) => setField('expectedReturn', e.target.value)} />
          </div>
          <div>
            <Label>{t('retirement.volatility')} (%)</Label>
            <Input type="number" step="0.1" value={form.volatility} onChange={(e) => setField('volatility', e.target.value)} />
          </div>
          <div>
            <Label>{t('retirement.inflation')} (%)</Label>
            <Input type="number" step="0.1" value={form.inflation} onChange={(e) => setField('inflation', e.target.value)} />
          </div>
          <div>
            <Label>Simulations</Label>
            <Input type="number" value={form.simulationCount} onChange={(e) => setField('simulationCount', e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void run()} loading={busy} className="w-full lg:w-auto">
              {!busy && <Play className="h-4 w-4" />}
              {t('retirement.runSimulation')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('retirement.successRate')}
              value={formatPercent(result.successRate)}
            />
            <StatCard
              label={t('retirement.failureRate')}
              value={formatPercent(result.failureRate)}
            />
            <StatCard
              label={t('retirement.medianBalanceAtRetirement')}
              value={formatCurrency(result.medianPortfolioAtRetirement)}
            />
            <StatCard
              label={t('retirement.medianShortfallAge')}
              value={result.medianShortfallAge != null ? String(result.medianShortfallAge) : '—'}
              sub={t('retirement.medianYears') + `: ${result.medianYearsOfRetirement.toFixed(1)}`}
            />
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Projected portfolio balance (5th / 50th / 95th percentile)</CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                data={chartData}
                series={[
                  { key: 'p5', name: '5th percentile', color: 'var(--coral)' },
                  { key: 'p50', name: 'Median', color: 'var(--lagoon-deep)' },
                  { key: 'p95', name: '95th percentile', color: 'var(--palm)' },
                ]}
                formatValue={(v) => formatCurrency(v)}
              />
            </CardContent>
          </Card>
        </>
      )}
    </main>
  )
}
