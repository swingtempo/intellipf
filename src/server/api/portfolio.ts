import { createServerFn } from '@tanstack/react-start'
import { ensureUserScoped } from '../user'
import { getPortfolio } from '../services/queries'

export const getPortfolioData = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  return getPortfolio(userId)
})
