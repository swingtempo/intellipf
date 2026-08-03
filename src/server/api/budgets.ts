import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { uid } from '#/lib/utils'
import { ensureUserScoped } from '../user'
import { getDb, schema } from '../db'
import { getBudgetsWithSpending } from '../services/queries'

export const getBudgets = createServerFn({ method: 'POST' })
  .validator(z.object({ month: z.string() }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    return getBudgetsWithSpending(userId, data.month)
  })

export const upsertBudget = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().optional(),
      category: z.string(),
      month: z.string(),
      amount: z.number().min(0),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    const db = getDb()
    if (data.id) {
      const [existing] = await db
        .select()
        .from(schema.budgets)
        .where(eq(schema.budgets.id, data.id))
        .limit(1)
      if (existing && existing.userId === userId) {
        await db
          .update(schema.budgets)
          .set({ amount: data.amount, category: data.category, month: data.month })
          .where(eq(schema.budgets.id, data.id))
        return { id: data.id }
      }
    }
    const byCategory = await db
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.category, data.category))
    const found = byCategory.find((b) => b.userId === userId && b.month === data.month)
    if (found) {
      await db
        .update(schema.budgets)
        .set({ amount: data.amount })
        .where(eq(schema.budgets.id, found.id))
      return { id: found.id }
    }
    const id = uid('bud')
    await db.insert(schema.budgets).values({
      id,
      userId,
      category: data.category,
      month: data.month,
      amount: data.amount,
    })
    return { id }
  })

export const deleteBudget = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    const db = getDb()
    const [existing] = await db
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, data.id))
      .limit(1)
    if (existing && existing.userId === userId) {
      await db.delete(schema.budgets).where(eq(schema.budgets.id, data.id))
    }
    return { ok: true }
  })
