import { useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { FileUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  importQifFile,
  previewQif,
} from '#/server/api/qif'
import { listAccounts } from '#/server/api/accounts'
import type { ImportQifResult } from '#/server/services/qif'
import { Button } from './ui/button'
import { Input, Label } from './ui/input'
import { Select } from './ui/select'
import { Badge } from './ui/badge'

export function QifImportForm() {
  const { t } = useTranslation()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState<{ type: string; recordCount: number }[] | null>(null)
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof listAccounts>>>([])
  const [accountId, setAccountId] = useState('')
  const [accountName, setAccountName] = useState('')
  const [result, setResult] = useState<ImportQifResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFileChange(file: File) {
    setError(null)
    setResult(null)
    setPreview(null)
    const text = await file.text()
    setFileName(file.name)
    setContent(text)
    try {
      const p = await previewQif({ data: { content: text } })
      setPreview(p.sections)
      const accs = await listAccounts()
      setAccounts(accs)
      if (p.accounts[0]?.name && !accountId) {
        setAccountName(p.accounts[0].name)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function doImport() {
    setBusy(true)
    setError(null)
    try {
      const res = await importQifFile({ data: { fileName, content, accountId: accountId || null, accountName: accountName || null } })
      setResult(res)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".qif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onFileChange(file)
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          <FileUp className="h-4 w-4" />
          {t('settings.chooseFile')}
        </Button>
        {fileName && <Badge>{fileName}</Badge>}
        {preview && (
          <span className="text-xs text-[var(--sea-ink-soft)]">
            {preview.map((s) => `${s.type} (${s.recordCount})`).join(' · ')}
          </span>
        )}
      </div>

      {content && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t('settings.account')}</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{t('settings.newAccountName')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('settings.newAccountName')}</Label>
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder={fileName.replace(/\.qif$/i, '') || 'Imported Account'}
            />
          </div>
        </div>
      )}

      {content && (
        <Button onClick={doImport} loading={busy} disabled={busy}>
          {t('common.add')}
        </Button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] p-4 text-sm">
          <p className="font-semibold text-[var(--sea-ink)]">
            {t('settings.imported')} → {result.accountUsed.name}: {result.transactionsImported}{' '}
            {t('settings.transactions')}
            {result.holdingsChanged > 0 && ` · ${result.holdingsChanged} ${t('settings.holdingsChanged')}`}
          </p>
        </div>
      )}
    </div>
  )
}
