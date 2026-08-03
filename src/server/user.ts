import { and, eq, sql } from 'drizzle-orm'
import { getDb, schema } from './db'

const DEFAULT_USER_EMAIL = 'demo@intellipf.local'
const DEFAULT_USER_NAME = 'Demo User'

export async function getOrCreateDefaultUser() {
  const db = getDb()
  let [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEFAULT_USER_EMAIL))
    .limit(1)
  if (!user) {
    const id = crypto.randomUUID()
    await db.insert(schema.users).values({
      id,
      name: DEFAULT_USER_NAME,
      email: DEFAULT_USER_EMAIL,
    })
    ;[user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1)
  }
  return user!
}

export async function getUserById(userId: string) {
  const db = getDb()
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  return user
}

export async function listUsers() {
  const db = getDb()
  return db.select().from(schema.users)
}

export async function ensureUserScoped(userId?: string) {
  if (userId) return userId
  const user = await getOrCreateDefaultUser()
  return user.id
}

export async function userHasData(userId: string) {
  const db = getDb()
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.isActive, true)))
  return (rows[0]?.count ?? 0) > 0
}
