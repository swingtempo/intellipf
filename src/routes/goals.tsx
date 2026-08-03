import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react'
import { createGoal, deleteGoal, listGoals, updateGoal } from '#/server/api/goals'
import { PageHeader } from '../components/page-header'
import { Card, CardContent } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input, Label } from '../components/ui/input'
import { Dialog } from '../components/ui/dialog'
import { EmptyState } from '../components/ui/empty-state'
import { formatCurrency, formatDate } from '#/lib/format'

export const Route = createFileRoute('/goals')({
  loader: async () => ({ goals: await listGoals() }),
  component: GoalsPage,
})

interface GoalForm {
  id?: string
  name: string
  targetAmount: string
  currentAmount: string
  targetDate: string
}

function GoalsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const initialGoals = Route.useLoaderData().goals
  const [goals, setGoals] = useState(initialGoals)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<GoalForm>({ name: '', targetAmount: '', currentAmount: '', targetDate: '' })
  const [busy, setBusy] = useState(false)

  function openCreate() {
    setForm({ name: '', targetAmount: '', currentAmount: '', targetDate: '' })
    setDialogOpen(true)
  }

  function openEdit(goal: (typeof goals)[number]) {
    setForm({
      id: goal.id,
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      currentAmount: String(goal.currentAmount),
      targetDate: goal.targetDate ?? '',
    })
    setDialogOpen(true)
  }

  async function save() {
    setBusy(true)
    try {
      if (form.id) {
        await updateGoal({ data: { id: form.id, name: form.name, targetAmount: Number(form.targetAmount) || 0, currentAmount: Number(form.currentAmount) || 0, targetDate: form.targetDate || null } })
      } else {
        await createGoal({ data: { name: form.name, targetAmount: Number(form.targetAmount) || 0, currentAmount: Number(form.currentAmount) || 0, targetDate: form.targetDate || null } })
      }
      setDialogOpen(false)
      setGoals(await listGoals())
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await deleteGoal({ data: { id } })
    setGoals(await listGoals())
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('goals.title')} subtitle={t('goals.subtitle')}>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('goals.addGoal')}
        </Button>
      </PageHeader>

      {goals.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title={t('goals.noGoals')}
          description={t('goals.noGoalsHint')}
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t('goals.addGoal')}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const progress = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0
            const reached = goal.currentAmount >= goal.targetAmount
            const monthsLeft = goal.targetDate
              ? Math.max(
                  0,
                  Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)),
                )
              : null
            return (
              <Card key={goal.id} className="relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: goal.color ?? undefined }} />
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-[var(--sea-ink)]">{goal.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--sea-ink-soft)]">
                        {goal.targetDate ? formatDate(goal.targetDate) : t('common.none')}
                        {monthsLeft != null && monthsLeft > 0 && ` · ${monthsLeft} mo left`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(goal)}
                        className="rounded-full p-1.5 text-[var(--sea-ink-soft)] transition hover:bg-[rgba(79,184,178,0.14)] hover:text-[var(--lagoon-deep)]"
                        aria-label={t('common.edit')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void remove(goal.id)}
                        className="rounded-full p-1.5 text-[var(--sea-ink-soft)] transition hover:bg-red-500/10 hover:text-red-600"
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <p className="text-2xl font-bold text-[var(--sea-ink)]">
                      {formatCurrency(goal.currentAmount)}
                    </p>
                    <p className="text-xs text-[var(--sea-ink-soft)]">
                      of {formatCurrency(goal.targetAmount)}
                    </p>
                  </div>

                  <Progress className="mt-3" value={progress} tone={reached ? 'success' : 'default'} />

                  <div className="mt-3">
                    <Badge tone={reached ? 'success' : 'neutral'}>
                      {Math.round(progress * 100)}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={form.id ? t('goals.editGoal') : t('goals.addGoal')}
      >
        <div className="space-y-4">
          <div>
            <Label>{t('goals.goalName')}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t('goals.targetAmount')}</Label>
              <Input
                type="number"
                value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('goals.currentAmount')}</Label>
              <Input
                type="number"
                value={form.currentAmount}
                onChange={(e) => setForm({ ...form, currentAmount: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>{t('goals.targetDate')}</Label>
            <Input
              type="date"
              value={form.targetDate}
              onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save()} loading={busy} disabled={!form.name}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  )
}
