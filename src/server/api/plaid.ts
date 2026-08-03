import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ensureUserScoped } from '../user'
import {
  createLinkToken,
  exchangePublicToken,
  isPlaidConfigured,
  listPlaidItems,
  removePlaidItem,
  syncAllPlaidForUser,
} from '../services/plaid'

export const plaidStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  return {
    configured: isPlaidConfigured(),
    items: await listPlaidItems(userId),
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

export const syncAll = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  const results = await syncAllPlaidForUser(userId)
  return results
})

export const removeItem = createServerFn({ method: 'POST' })
  .validator(z.object({ itemId: z.string() }))
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    return removePlaidItem(userId, data.itemId)
  })
