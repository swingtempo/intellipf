import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ensureUserScoped } from '../user'
import { getAccountsWithBalance, getTransactions } from '../services/queries'

export const listAccounts = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  return getAccountsWithBalance(userId)
})

export const getAccountTransactions = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      accountId: z.string(),
      limit: z.number().min(1).max(500).optional().default(100),
      offset: z.number().min(0).optional().default(0),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    return getTransactions(userId, {
      accountId: data.accountId,
      limit: data.limit,
      offset: data.offset,
    })
  })
