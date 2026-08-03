import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, RefreshCw, Trash2 } from 'lucide-react'
import { plaidStatus, removeItem, syncAll } from '#/server/api/plaid'
import { getChatConfig } from '#/server/api/chat'
import { PageHeader } from '../components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { PlaidLinkButton } from '../components/plaid-link'
import { QifImportForm } from '../components/qif-import'
import { formatDate } from '#/lib/format'

export const Route = createFileRoute('/settings')({
  loader: async () => {
    const [plaid, chat] = await Promise.all([plaidStatus(), getChatConfig()])
    return { plaid, chat }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const initial = Route.useLoaderData()
  const [plaid, setPlaid] = useState(initial.plaid)
  const [syncing, setSyncing] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function doSync() {
    setSyncing(true)
    try {
      await syncAll()
      const fresh = await plaidStatus()
      setPlaid(fresh)
      await router.invalidate()
    } finally {
      setSyncing(false)
    }
  }

  async function doRemove(itemId: string) {
    setRemoving(true)
    try {
      await removeItem({ data: { itemId } })
      const fresh = await plaidStatus()
      setPlaid(fresh)
      await router.invalidate()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.connections')}</CardTitle>
            <CardDescription>
              {plaid.configured
                ? `${plaid.items.length} ${t('settings.connections').toLowerCase()}`
                : t('settings.plaidNotConfigured')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {plaid.configured && (
              <div className="mb-4">
                <PlaidLinkButton />
              </div>
            )}
            {plaid.items.length === 0 ? (
              <EmptyState icon={Building2} title={t('settings.noConnections')} />
            ) : (
              <ul className="space-y-3">
                {plaid.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--sea-ink)]">
                        {item.institutionName ?? 'Bank'}
                      </p>
                      <p className="text-xs text-[var(--sea-ink-soft)]">
                        {item.accounts.length} {t('accounts.title').toLowerCase()} ·{' '}
                        {item.lastSyncAt ? `Synced ${formatDate(item.lastSyncAt)}` : t('common.none')}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Badge tone="success">{t('settings.connected')}</Badge>
                      <Button variant="outline" size="sm" onClick={() => void doSync()} loading={syncing}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t('settings.sync')}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void doRemove(item.id)} loading={removing}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.importQif')}</CardTitle>
            <CardDescription>{t('settings.importQifHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <QifImportForm />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('settings.llmProvider')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge tone={initial.chat.configured ? 'success' : 'warning'}>
            {initial.chat.provider} · {initial.chat.model}
          </Badge>
          {initial.chat.configured ? (
            <span className="text-sm text-[var(--sea-ink-soft)]">{t('settings.llmConfigured')}</span>
          ) : (
            <span className="text-sm text-amber-600">{t('settings.llmNotConfigured')}</span>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
