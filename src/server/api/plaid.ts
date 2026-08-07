import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ensureUserScoped } from '../user'
import {
  createLinkToken,
  exchangePublicToken,
  isPlaidConfigured,
  listPlaidItems,
  removePlaidItem,
  syncAccountForUser,
  syncAllPlaidForUser,
  syncItemForUser,
} from '../services/plaid'
import {
  listPendingReviews,
  resolveMatchReview as resolveMatchReviewService,
} from '../services/transactionMatch'

export const plaidStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  const items = await listPlaidItems(userId)
  return {
    configured: isPlaidConfigured(),
    items,
    pendingReviewCount: items.reduce((sum, item) => sum + item.pendingReviewCount, 0),
  }
})

export const getLinkToken = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  const result = await createLinkToken(userId)
  return result
})

export const exchangeToken = createServerFn({ method: 'POST' })
  .validator(z.object({ publicToken: z.string() }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    const result = await exchangePublicToken(userId, data.publicToken)
    await syncAllPlaidForUser(userId)
    return result
  })

export const syncAll = createServerFn({ method: 'POST' }).handler(async () => {
  const userId = await ensureUserScoped()
  return syncAllPlaidForUser(userId)
})

export const syncItem = createServerFn({ method: 'POST' })
  .validator(z.object({ itemId: z.string() }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    return syncItemForUser(userId, data.itemId)
  })

export const syncAccount = createServerFn({ method: 'POST' })
  .validator(z.object({ accountId: z.string() }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    return syncAccountForUser(userId, data.accountId)
  })

export const listMatchReviews = createServerFn({ method: 'POST' })
  .validator(z.object({ accountId: z.string().optional() }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    return listPendingReviews(userId, data.accountId)
  })

export const resolveMatchReview = createServerFn({ method: 'POST' })
  .validator(z.object({ reviewId: z.string(), action: z.enum(['merge', 'dismiss']) }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    return resolveMatchReviewService(userId, data.reviewId, data.action)
  })

export const removeItem = createServerFn({ method: 'POST' })
  .validator(z.object({ itemId: z.string() }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    return removePlaidItem(userId, data.itemId)
  })
