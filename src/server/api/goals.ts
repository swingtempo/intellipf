import { createServerFn } from '@tanstack/react-start'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { uid } from '#/lib/utils'
import { ensureUserScoped } from '../user'
import { getDb, schema } from '../db'

export const listGoals = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  const db = getDb()
  return db
    .select()
    .from(schema.goals)
    .where(eq(schema.goals.userId, userId))
    .orderBy(asc(schema.goals.createdAt))
})

export const createGoal = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().min(1),
      targetAmount: z.number().min(0),
      currentAmount: z.number().min(0).optional().default(0),
      targetDate: z.string().optional().nullable(),
      icon: z.string().optional().default('piggy-bank'),
      color: z.string().optional().default('#4fb8b2'),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    const db = getDb()
    const id = uid('goal')
    await db.insert(schema.goals).values({
      id,
      userId,
      name: data.name,
      targetAmount: data.targetAmount,
      currentAmount: data.currentAmount,
      targetDate: data.targetDate ?? null,
      icon: data.icon,
      color: data.color,
    })
    const [goal] = await db.select().from(schema.goals).where(eq(schema.goals.id, id)).limit(1)
    return goal
  })

export const updateGoal = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      targetAmount: z.number().min(0).optional(),
      currentAmount: z.number().min(0).optional(),
      targetDate: z.string().optional().nullable(),
      icon: z.string().optional(),
      color: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    const db = getDb()
    const [existing] = await db
      .select()
      .from(schema.goals)
      .where(eq(schema.goals.id, data.id))
      .limit(1)
    if (!existing || existing.userId !== userId) {
      throw new Error('Goal not found.')
    }
    await db
      .update(schema.goals)
      .set({
        name: data.name ?? existing.name,
        targetAmount: data.targetAmount ?? existing.targetAmount,
        currentAmount: data.currentAmount ?? existing.currentAmount,
        targetDate: data.targetDate === undefined ? existing.targetDate : data.targetDate,
        icon: data.icon ?? existing.icon,
        color: data.color ?? existing.color,
      })
      .where(eq(schema.goals.id, data.id))
    const [goal] = await db.select().from(schema.goals).where(eq(schema.goals.id, data.id)).limit(1)
    return goal
  })

export const deleteGoal = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    const db = getDb()
    const [existing] = await db
      .select()
      .from(schema.goals)
      .where(eq(schema.goals.id, data.id))
      .limit(1)
    if (existing && existing.userId === userId) {
      await db.delete(schema.goals).where(eq(schema.goals.id, data.id))
    }
    return { ok: true }
  })
