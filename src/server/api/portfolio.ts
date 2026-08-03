import { createServerFn } from '@tanstack/react-start'
import { ensureUserScoped } from '../user'
import { getPortfolio } from '../services/queries'
import { syncStockPrices as fetchPrices } from '../services/prices'

export const getPortfolioData = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  return getPortfolio(userId)
})

export const syncStockPrices = createServerFn({ method: 'POST' }).handler(async () => {
  const userId = await ensureUserScoped()
  return fetchPrices(userId)
})
