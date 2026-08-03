import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { ensureUserScoped } from '../user'
import { getDb, schema } from '../db'

const SETTING_KEYS = ['home_currency', 'default_theme'] as const

export const getSettings = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  const db = getDb()
  const rows = await db.select().from(schema.settings)
  const userRows = rows.filter((r) => r.userId === userId || r.userId === null)
  const result: Record<string, string | null> = {}
  for (const key of SETTING_KEYS) {
    const row = userRows.find((r) => r.key === key)
    result[key] = row?.value ?? null
  }
  return result
})

export const saveSetting = createServerFn({ method: 'POST' })
  .validator(z.object({ key: z.enum(SETTING_KEYS), value: z.string().nullable() }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    const db = getDb()
    const [existing] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, data.key))
      .limit(1)
    if (existing && (existing.userId === userId || existing.userId === null)) {
      await db
        .update(schema.settings)
        .set({ value: data.value, userId, updatedAt: new Date().toISOString() })
        .where(eq(schema.settings.key, data.key))
    } else if (existing) {
      await db.insert(schema.settings).values({ key: data.key, value: data.value, userId })
    } else {
      await db.insert(schema.settings).values({ key: data.key, value: data.value, userId })
    }
    return { key: data.key, value: data.value }
  })
