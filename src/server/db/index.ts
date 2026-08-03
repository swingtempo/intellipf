import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { getEnv } from '#/lib/env'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

let db: Db | undefined

function resolveDbPath(p: string): string {
  if (p === ':memory:') return p
  if (path.isAbsolute(p)) return p
  return path.resolve(process.cwd(), p)
}

function resolveMigrationsFolder(): string {
  const candidates = [
    path.resolve(process.cwd(), 'drizzle'),
    path.resolve(process.cwd(), '.output/server/drizzle'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[0]!
}

export function createDb(): Db {
  const url = getEnv('DATABASE_URL') ?? 'data/sqlite.db'
  const file = resolveDbPath(url)
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  }

  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')

  const instance = drizzle(sqlite, { schema })

  if (file !== ':memory:') {
    migrate(instance, { migrationsFolder: resolveMigrationsFolder() })
  }

  return instance
}

export function getDb(): Db {
  if (!db) db = createDb()
  return db
}

export function getRawSqlClient() {
  return (getDb() as unknown as { $client: Database.Database }).$client
}

export function resetDbForTests(): Db {
  if (db) {
    getRawSqlClient().close()
    db = undefined
  }
  return getDb()
}

export { schema }
