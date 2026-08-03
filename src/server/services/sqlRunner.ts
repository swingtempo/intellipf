import { getRawSqlClient } from '../db'

const ALLOWED_TABLES = new Set([
  'users',
  'plaid_items',
  'accounts',
  'balances',
  'transactions',
  'securities',
  'holdings',
  'budgets',
  'goals',
  'net_worth_snapshots',
  'settings',
])

const MAX_ROWS = 500

export interface SqlQueryResult {
  columns: string[]
  rows: Array<Record<string, any>>
  rowCount: number
  truncated: boolean
}

export function validateAndRunQuery(rawSql: string): SqlQueryResult {
  const sql = stripComments(rawSql).trim()

  if (!sql) {
    throw new Error('Empty SQL query.')
  }
  if (!/^\s*(SELECT|WITH)\b/i.test(sql)) {
    throw new Error('Only SELECT (or WITH ... SELECT) statements are allowed.')
  }

  const normalized = sql.replace(/\s+/g, ' ').toLowerCase()
  const forbidden = [
    'insert',
    'update',
    'delete',
    'drop',
    'alter',
    'create',
    'attach',
    'detach',
    'pragma',
    'reindex',
    'vacuum',
    'replace',
    'grant',
    'revoke',
    'trigger',
    'temp',
  ]
  for (const keyword of forbidden) {
    if (new RegExp(`\\b${keyword}\\b`).test(normalized)) {
      throw new Error(`Forbidden SQL keyword: ${keyword}`)
    }
  }

  const statementCount = (sql.match(/;/g) ?? []).length
  if (statementCount > 1) {
    throw new Error('Only a single SQL statement is allowed.')
  }
  const withoutSemicolon = sql.replace(/;\s*$/, '')

  const referencedTables = Array.from(
    withoutSemicolon.matchAll(/\b(?:from|join)\s+["`']?([a-zA-Z_][a-zA-Z0-9_]*)/gi),
  ).map((match) => match[1]!.toLowerCase())

  for (const table of referencedTables) {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`Access denied: table "${table}" is not in the allowed list.`)
    }
  }

  const hasLimit = /\blimit\s+\d+/i.test(withoutSemicolon)
  const limited = hasLimit
    ? withoutSemicolon
    : `${withoutSemicolon} LIMIT ${MAX_ROWS}`
  const capped = limited.replace(/\blimit\s+\d+/i, (match) => {
    const number = Number(match.replace(/limit/i, '').trim())
    return `LIMIT ${Math.min(number, MAX_ROWS)}`
  })

  let stmt
  try {
    const raw = getRawSqlClient()
    stmt = raw.prepare(capped)
  } catch (error) {
    throw new Error(`Invalid SQL: ${error instanceof Error ? error.message : String(error)}`)
  }

  let rows: unknown[]
  try {
    rows = stmt.all() as unknown[]
  } catch (error) {
    throw new Error(
      `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const cleanRows = rows.slice(0, MAX_ROWS) as Array<Record<string, any>>
  const columns =
    cleanRows.length > 0 ? Object.keys(cleanRows[0]!) : stmt.columns().map((c) => c.name)

  return {
    columns,
    rows: cleanRows,
    rowCount: cleanRows.length,
    truncated: rows.length > MAX_ROWS,
  }
}

function stripComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => {
      const stripped = line.replace(/--.*$/, '')
      return stripped.replace(/\/\*[\s\S]*?\*\//g, '')
    })
    .join('\n')
}
