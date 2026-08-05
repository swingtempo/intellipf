import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ensureUserScoped } from '../user'
import { getUserAllocations, saveUserAllocation, deleteUserAllocation } from '../services/allocations'

const allocationSchema = z.object({
  assetClass: z.enum(['Equity', 'Fixed Income', 'Cash & Equivalents', 'Real Estate', 'Commodities', 'Alternative', 'Other']),
  weight: z.number(),
})

export const getSecurityAllocations = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  return getUserAllocations(userId)
})

export const updateSecurityAllocation = createServerFn({ method: 'POST' })
  .validator(z.object({ ticker: z.string(), allocations: z.array(allocationSchema) }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    await saveUserAllocation(userId, data.ticker, data.allocations)
    return { success: true }
  })

export const deleteSecurityAllocation = createServerFn({ method: 'POST' })
  .validator(z.object({ ticker: z.string() }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    await deleteUserAllocation(userId, data.ticker)
    return { success: true }
  })
