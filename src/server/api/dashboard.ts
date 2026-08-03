import { createServerFn } from '@tanstack/react-start'
import { ensureUserScoped } from '../user'
import { getDashboardData } from '../services/queries'

export const getDashboard = createServerFn({ method: 'GET' }).handler(async () => {
  const userId = await ensureUserScoped()
  return getDashboardData(userId)
})
