import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { deleteBudget, getBudgets, upsertBudget } from '#/server/api/budgets'
import { listCategories } from '#/server/api/transactions'
import { PageHeader } from '../components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input, Label } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Dialog } from '../components/ui/dialog'
import { EmptyState } from '../components/ui/empty-state'
import { formatCurrency } from '#/lib/format'

export const Route = createFileRoute('/budgets')({
  loader: async () => {
    const month = new Date().toISOString().slice(0, 7)
    const [budgets, categories] = await Promise.all([getBudgets({ data: { month } }), listCategories()])
    return { month, budgets, categories }
  },
  component: BudgetsPage,
})

function BudgetsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const initial = Route.useLoaderData()
  const [month, setMonth] = useState(initial.month)
  const [budgets, setBudgets] = useState(initial.budgets.budgets)
  const [unbudgeted, setUnbudgeted] = useState(initial.budgets.unbudgeted)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<{ id?: string; category: string; amount: number } | null>(null)
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadMonth(target: string) {
    setMonth(target)
    const result = await getBudgets({ data: { month: target } })
    setBudgets(result.budgets)
    setUnbudgeted(result.unbudgeted)
  }

  function openCreate() {
    setEditing(null)
    setCategory('')
    setAmount('')
    setDialogOpen(true)
  }

  function openEdit(budget: (typeof budgets)[number]) {
    setEditing({ id: budget.id, category: budget.category, amount: budget.amount })
    setCategory(budget.category)
    setAmount(String(budget.amount))
    setDialogOpen(true)
  }

  async function save() {
    setBusy(true)
    try {
      await upsertBudget({ data: { id: editing?.id, category, month, amount: Number(amount) || 0 } })
      setDialogOpen(false)
      const result = await getBudgets({ data: { month } })
      setBudgets(result.budgets)
      setUnbudgeted(result.unbudgeted)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await deleteBudget({ data: { id } })
    const result = await getBudgets({ data: { month } })
    setBudgets(result.budgets)
    setUnbudgeted(result.unbudgeted)
  }

  const categoryOptions = Array.from(
    new Set([...budgets.map((b) => b.category), ...initial.categories]),
  ).sort()

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('budgets.title')} subtitle={t('budgets.subtitle')}>
        <Input type="month" value={month} onChange={(e) => void loadMonth(e.target.value)} className="w-44" />
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('budgets.addBudget')}
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{month}</CardTitle>
          </CardHeader>
          <CardContent>
            {budgets.length === 0 ? (
              <EmptyState
                title={t('budgets.title')}
                description={t('budgets.addBudget')}
                action={
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" />
                    {t('budgets.addBudget')}
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-5">
                {budgets.map((budget) => {
                  const over = budget.spent > budget.amount
                  return (
                    <li key={budget.id}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[var(--sea-ink)]">{budget.category}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--sea-ink-soft)]">
                            {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                          </span>
                          {over && (
                            <Badge tone="danger">
                              {formatCurrency(budget.spent - budget.amount)} {t('budgets.over')}
                            </Badge>
                          )}
                          <button
                            onClick={() => openEdit(budget)}
                            className="rounded-full p-1 text-[var(--sea-ink-soft)] transition hover:bg-[rgba(79,184,178,0.14)] hover:text-[var(--lagoon-deep)]"
                            aria-label={t('common.edit')}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => void remove(budget.id)}
                            className="rounded-full p-1 text-[var(--sea-ink-soft)] transition hover:bg-red-500/10 hover:text-red-600"
                            aria-label={t('common.delete')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                      <Progress
                        value={budget.progress}
                        tone={over ? 'danger' : budget.progress >= 0.8 ? 'warning' : budget.progress >= 1 ? 'danger' : 'default'}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('budgets.unbudgeted')}</CardTitle>
          </CardHeader>
          <CardContent>
            {unbudgeted.length === 0 ? (
              <p className="text-sm text-[var(--sea-ink-soft)]">{t('common.none')}</p>
            ) : (
              <ul className="space-y-2">
                {unbudgeted.map((entry) => (
                  <li key={entry.category} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--sea-ink)]">{entry.category}</span>
                    <span className="font-semibold text-[var(--sea-ink-soft)]">{formatCurrency(entry.spent)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? t('budgets.editBudget') : t('budgets.addBudget')}
      >
        <div className="space-y-4">
          <div>
            <Label>{t('common.category')}</Label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t('common.none')}</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('budgets.monthlyLimit')}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500.00"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save()} loading={busy} disabled={!category}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  )
}
