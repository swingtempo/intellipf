import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ensureUserScoped } from '../user'
import {
  getDistinctCategories,
  getTransactions,
  type TransactionFilters,
} from '../services/queries'

export const searchTransactions = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      accountId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      search: z.string().optional(),
      category: z.string().optional(),
      source: z.string().optional(),
      limit: z.number().min(1).max(500).optional(),
      offset: z.number().min(0).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    const filters: TransactionFilters = {
      accountId: data.accountId,
      from: data.from,
      to: data.to,
      search: data.search,
      category: data.category,
      source: data.source,
      limit: data.limit,
      offset: data.offset,
    }
    return getTransactions(userId, filters)
  })

export const listCategories = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  return getDistinctCategories(userId)
})
