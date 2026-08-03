import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  Bot,
  Database,
  LineChart,
  PiggyBank,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '../components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export const Route = createFileRoute('/about')({
  component: AboutPage,
})

const FEATURES = [
  { icon: LineChart, title: 'Net worth tracking', description: 'Automatic daily balance snapshots and a net worth history built from your real accounts.' },
  { icon: PiggyBank, title: 'Budgets & goals', description: 'Monthly category budgets with live spending progress, plus savings goals with target dates.' },
  { icon: Wallet, title: 'Investments', description: 'Holdings from Plaid Investments or Quicken QIF files, with live pricing and asset allocation.' },
  { icon: Bot, title: 'AI finance assistant', description: 'Ask questions in plain language. The assistant writes read-only SQL against your own database.' },
  { icon: ShieldCheck, title: 'Self-hosted & private', description: 'All data lives in a local SQLite file on your machine. No third-party analytics or tracking.' },
  { icon: Database, title: 'Portable data', description: 'Bring your own Plaid keys, price provider keys, and LLM keys. Everything is configured via .env.' },
]

export function AboutPage() {
  const { t } = useTranslation()

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('about.title')} subtitle={t('about.subtitle')} />

      <Card className="mb-6 p-6">
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--sea-ink)]">
          IntelliPF is a self-hosted personal finance dashboard that connects to your banks
          through Plaid (or imports Quicken QIF files), stores everything in a local SQLite
          database, and layers on budgets, goals, an investment portfolio with asset allocation,
          a Monte Carlo retirement planner, and an AI assistant that can query your own data.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <Card key={feature.title}>
            <CardContent>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(79,184,178,0.14)] text-[var(--lagoon-deep)]">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-[var(--sea-ink)]">{feature.title}</h3>
              <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('about.stack')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm text-[var(--sea-ink-soft)] sm:grid-cols-2">
            <li>TanStack Start (React Router + Server Functions)</li>
            <li>SQLite + Drizzle ORM</li>
            <li>Plaid API</li>
            <li>react-i18next internationalization</li>
            <li>OpenAI / Anthropic / OpenRouter LLM providers</li>
            <li>Finnhub, Alpha Vantage, and Stratamore data providers</li>
          </ul>
        </CardContent>
      </Card>
    </main>
  )
}
