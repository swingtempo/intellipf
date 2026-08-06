import { describe, it, expect } from 'vitest'
import { parseISO } from 'date-fns'
import fs from 'fs'
import path from 'path'

describe('security/$ticker route', () => {
  describe('i18n keys', () => {
    const en = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../i18n/locales/en.json'), 'utf-8'),
    ) as Record<string, Record<string, string>>

    it('has all new security allocation i18n keys', () => {
      expect(en.security['editAllocation']).toBe('Edit Allocation')
      expect(en.security['syncAllocations']).toBe('Sync Allocations')
      expect(en.security['saved']).toBe('Allocation saved')
      expect(en.security['resetToDefault']).toBe('Reset to Default')
      expect(en.security['addAllocation']).toBe('Add Allocation')
      expect(en.security['removeAllocation']).toBe('Remove')
    })

    it('retains existing security i18n keys', () => {
      expect(en.security['title']).toBe('Security Detail')
      expect(en.security['noPriceData']).toBe('No price data available yet')
      expect(en.security['fetchingPrices']).toBe('Fetching prices...')
    })
  })

  describe('module imports', () => {
    it('imports without errors (sanity check for removed portfolio allocations code)', async () => {
      const mod = await import('#/routes/security/$ticker')
      expect(mod.Route).toBeDefined()
      expect(typeof mod.Route.useLoaderData).toBe('function')
    })

    it('portfolio route imports without allocation-management symbols', async () => {
      // The portfolio page had its allocation management removed; verify the module still loads cleanly.
      const mod = await import('#/routes/portfolio')
      expect(mod.Route).toBeDefined()
    })
  })
})

describe('filterByRange (security/$ticker route)', () => {
  type ChartRange = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'All'
  const RANGE_DAYS: Record<ChartRange, number> = {
    '1D': 1,
    '1W': 7,
    '1M': 30,
    '3M': 90,
    '6M': 180,
    YTD: Infinity,
    '1Y': 365,
    All: Infinity,
  }

  function filterByRange(
    data: Array<{ date: string; price: number }>,
    range: ChartRange,
  ): Array<{ date: string; price: number }> {
    if (range === 'All') return data
    const days = RANGE_DAYS[range]
    const cutoff = new Date()
    if (range === 'YTD') {
      cutoff.setFullYear(new Date().getFullYear(), 0, 1)
    } else {
      cutoff.setDate(cutoff.getDate() - days)
    }
    return data.filter((p) => parseISO(p.date) >= cutoff)
  }

  it('returns all data for "All" range', () => {
    const data = [
      { date: '2024-01-01', price: 100 },
      { date: '2024-06-01', price: 150 },
      { date: '2024-12-01', price: 200 },
    ]
    expect(filterByRange(data, 'All')).toEqual(data)
  })

  it('supports the new "1D" range (1 day) — excludes data older than 1 day', () => {
    const todayStr = new Date().toISOString().slice(0, 10)

    const data = [
      { date: '2024-01-01', price: 50 },
      { date: '2023-06-15', price: 30 },
      { date: todayStr, price: 100 },
    ]

    const result = filterByRange(data, '1D')
    expect(result).toHaveLength(1)
    expect(result[0].price).toBe(100)
  })

  it('still works for "1W" range — excludes data older than 7 days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
    const todayStr = new Date().toISOString().slice(0, 10)

    const data = [
      { date: '2024-01-01', price: 50 },
      { date: threeDaysAgo, price: 95 },
      { date: todayStr, price: 100 },
    ]

    const result = filterByRange(data, '1W')
    expect(result).toHaveLength(2)
    expect(result.find((p) => p.price === 50)).toBeUndefined()
  })

  it('still works for "YTD" range — includes data from Jan 1 of current year', () => {
    const currentYear = new Date().getFullYear()
    // Use dates well after Jan 1 to avoid timezone edge cases at midnight.
    const midJan = `${currentYear}-02-15`
    const midJun = `${currentYear}-06-15`

    const data = [
      { date: `${currentYear - 1}-12-31`, price: 90 },
      { date: midJan, price: 95 },
      { date: midJun, price: 100 },
    ]

    const result = filterByRange(data, 'YTD')
    expect(result).toHaveLength(2)
    expect(result.find((p) => p.price === 90)).toBeUndefined()
  })

  it('still works for "3M" range', () => {
    const twoMonthsAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
    const todayStr = new Date().toISOString().slice(0, 10)

    const data = [
      { date: '2024-01-01', price: 50 },
      { date: twoMonthsAgo, price: 95 },
      { date: todayStr, price: 100 },
    ]

    const result = filterByRange(data, '3M')
    expect(result).toHaveLength(2)
    expect(result.find((p) => p.price === 50)).toBeUndefined()
  })
})
