import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  Bot,
  Database,
  LineChart,
  PiggyBank,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '../components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

export const Route = createFileRoute('/about')({
  component: AboutPage,
})

const FEATURES: Array<{ icon: LucideIcon; titleKey: string; descKey: string }> = [
  { icon: LineChart, titleKey: 'featureNetWorthTitle', descKey: 'featureNetWorthDesc' },
  { icon: PiggyBank, titleKey: 'featureBudgetsTitle', descKey: 'featureBudgetsDesc' },
  { icon: Wallet, titleKey: 'featureInvestmentsTitle', descKey: 'featureInvestmentsDesc' },
  { icon: Bot, titleKey: 'featureAssistantTitle', descKey: 'featureAssistantDesc' },
  { icon: ShieldCheck, titleKey: 'featurePrivacyTitle', descKey: 'featurePrivacyDesc' },
  { icon: Database, titleKey: 'featurePortableTitle', descKey: 'featurePortableDesc' },
]

function AboutPage() {
  const { t } = useTranslation()

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('about.title')} subtitle={t('about.subtitle')} />

      <Card className="mb-6 p-6">
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--sea-ink)]">
          {t('about.intro')}
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <Card key={feature.titleKey}>
            <CardContent>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(79,184,178,0.14)] text-[var(--lagoon-deep)]">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-[var(--sea-ink)]">{t(`about.${feature.titleKey}`)}</h3>
              <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">{t(`about.${feature.descKey}`)}</p>
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
            {(t('about.stackItems', { returnObjects: true }) as string[]).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  )
}
