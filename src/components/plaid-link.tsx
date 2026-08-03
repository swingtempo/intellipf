import { useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { useRouter } from '@tanstack/react-router'
import { Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { exchangeToken, getLinkToken } from '#/server/api/plaid'
import { Button } from './ui/button'

export function PlaidLinkButton({ label }: { label?: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    setMounted(true)
    let cancelled = false
    getLinkToken()
      .then((result) => {
        if (!cancelled) setToken(result.linkToken)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { open, ready } = usePlaidLink({
    token: token ?? null,
    onSuccess: async (publicToken) => {
      if (!publicToken) return
      setSyncing(true)
      try {
        await exchangeToken({ data: { publicToken } })
        await router.invalidate()
      } finally {
        setSyncing(false)
      }
    },
    onExit: () => undefined,
  })

  if (!mounted || error) {
    return (
      <Button variant="outline" disabled title={error ?? undefined}>
        {error ? t('settings.plaidNotConfigured') : t('common.loading')}
      </Button>
    )
  }

  return (
    <Button onClick={() => open()} disabled={!ready || syncing} loading={syncing}>
      {!syncing && <Link2 className="h-4 w-4" />}
      {label ?? t('accounts.linkBank')}
    </Button>
  )
}
