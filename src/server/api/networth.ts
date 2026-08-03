import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ensureUserScoped } from '../user'
import { getNetWorthSeries } from '../services/queries'

export const getNetWorth = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        months: z.number().min(1).max(120).optional().default(36),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    return getNetWorthSeries(userId, data?.months ?? 36)
  })
