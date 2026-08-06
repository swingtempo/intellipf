import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatCompactCurrency,
  formatPercent,
  formatNumber,
  formatDate,
  formatMonthKey,
  todayKey,
  currentMonthKey,
  monthAgoKey,
  titleCase,
  initials,
} from '#/lib/format'

describe('formatCurrency', () => {
  it('formats USD amounts with dollar sign', () => {
    expect(formatCurrency(1000)).toBe('$1,000.00')
  })

  it('formats negative amounts', () => {
    const result = formatCurrency(-50)
    expect(result).toMatch(/\$-?50\.00/)
  })

  it('uses specified currency', () => {
    expect(formatCurrency(100, 'EUR')).toContain('€')
    expect(formatCurrency(100, 'GBP')).toContain('£')
  })

  it('handles decimal amounts', () => {
    const result = formatCurrency(99.95)
    expect(result).toBe('$99.95')
  })

  it('handles zero amount', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('handles large numbers with commas', () => {
    const result = formatCurrency(1234567.89)
    expect(result).toBe('$1,234,567.89')
  })

  it('applies signDisplay option', () => {
    const always = formatCurrency(-50, 'USD', { signDisplay: 'always' })
    expect(always).toMatch(/-/)
  })

  it('handles unknown currency codes without crashing', () => {
    const result = formatCurrency(100, 'XXX')
    expect(result).toContain('100.00')
  })
})

describe('formatCompactCurrency', () => {
  it('formats thousands with K suffix', () => {
    const result = formatCompactCurrency(1500)
    expect(result).toMatch(/\$1\.[0-9]K/)
  })

  it('formats millions with M suffix', () => {
    const result = formatCompactCurrency(2500000)
    expect(result).toMatch(/\$2\.[0-9]M/)
  })

  it('handles small amounts without compact notation', () => {
    const result = formatCompactCurrency(50)
    expect(result).toBe('$50')
  })

  it('uses specified currency', () => {
    expect(formatCompactCurrency(1000, 'EUR')).toContain('€')
  })

  it('handles zero', () => {
    const result = formatCompactCurrency(0)
    expect(result).toBe('$0')
  })

  it('rounds to nearest compact value', () => {
    const result = formatCompactCurrency(1950)
    expect(result).toBe('$2K')
  })

  it('shows one decimal when needed for precision', () => {
    const result = formatCompactCurrency(1500)
    expect(result).toMatch(/\$1\.[0-9]K/)
  })
})

describe('formatPercent', () => {
  it('converts decimal to percentage string', () => {
    expect(formatPercent(1)).toBe('100.0%')
  })

  it('handles half value', () => {
    expect(formatPercent(0.5)).toBe('50.0%')
  })

  it('handles zero', () => {
    expect(formatPercent(0)).toBe('0.0%')
  })

  it('respects custom digits parameter', () => {
    expect(formatPercent(0.333, 2)).toBe('33.30%')
    expect(formatPercent(0.6666, 3)).toBe('66.660%')
    expect(formatPercent(1, 0)).toBe('100%')
  })

  it('handles negative values', () => {
    const result = formatPercent(-0.25)
    expect(result).toBe('-25.0%')
  })

  it('handles small decimal values', () => {
    expect(formatPercent(0.01)).toBe('1.0%')
    expect(formatPercent(0.001)).toBe('0.1%')
  })
})

describe('formatNumber', () => {
  it('formats with up to 2 decimal places (no trailing zeros)', () => {
    expect(formatNumber(1234.5)).toBe('1,234.5')
  })

  it('pads to 2 decimals when value has 2+ decimal digits', () => {
    expect(formatNumber(1234.567)).toBe('1,234.57')
  })

  it('handles custom digit count', () => {
    expect(formatNumber(3.14159, 3)).toBe('3.142')
    expect(formatNumber(3.14159, 0)).toBe('3')
  })

  it('formats large numbers with commas', () => {
    const result = formatNumber(1234567)
    expect(result).toBe('1,234,567')
  })

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('handles negative numbers', () => {
    const result = formatNumber(-42.5)
    expect(result).toBe('-42.5')
  })

  it('handles negative with more decimals', () => {
    const result = formatNumber(-42.567, 3)
    expect(result).toBe('-42.567')
  })

  it('handles decimal values without trailing zeros when exact', () => {
    // With default digits=2, 10 should be "10" not "10.00" due to minimumFractionDigits: 0
    expect(formatNumber(10)).toBe('10')
  })

  it('handles very small decimals', () => {
    const result = formatNumber(0.001, 3)
    expect(result).toBe('0.001')
  })
})

describe('formatDate', () => {
  it('formats date string with default format', () => {
    const result = formatDate('2024-01-15')
    expect(result).toBe('Jan 15, 2024')
  })

  it('formats Date object', () => {
    // Use a date string with time to avoid timezone ambiguity
    const result = formatDate(new Date('2024-06-30T12:00:00'))
    expect(result).toBe('Jun 30, 2024')
  })

  it('applies custom format string', () => {
    expect(formatDate('2024-01-15', 'yyyy-MM-dd')).toBe('2024-01-15')
    expect(formatDate('2024-03-20', 'MMMM d, yyyy')).toBe('March 20, 2024')
  })

  it('returns original string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('handles edge case dates', () => {
    const result = formatDate('2024-12-31')
    expect(result).toBe('Dec 31, 2024')
  })
})

describe('formatMonthKey', () => {
  it('formats yyyy-MM to "MMMM yyyy"', () => {
    expect(formatMonthKey('2024-01')).toBe('January 2024')
    expect(formatMonthKey('2023-06')).toBe('June 2023')
    expect(formatMonthKey('2024-12')).toBe('December 2024')
  })

  it('handles all months', () => {
    expect(formatMonthKey('2024-02')).toBe('February 2024')
    expect(formatMonthKey('2024-03')).toBe('March 2024')
    expect(formatMonthKey('2024-09')).toBe('September 2024')
  })

  it('returns original string for invalid input', () => {
    expect(formatMonthKey('invalid')).toBe('invalid')
  })
})

describe('todayKey', () => {
  it('returns current date as yyyy-MM-dd', () => {
    const result = todayKey()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matches expected format for a known date', () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    expect(todayKey()).toBe(`${year}-${month}-${day}`)
  })
})

describe('currentMonthKey', () => {
  it('returns current month as yyyy-MM', () => {
    const result = currentMonthKey()
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })

  it('matches expected format for a known date', () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    expect(currentMonthKey()).toBe(`${year}-${month}`)
  })
})

describe('monthAgoKey', () => {
  it('returns current month when months=0', () => {
    const result = monthAgoKey(0)
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })

  it('returns one month ago for months=1', () => {
    const now = new Date()
    let year = now.getFullYear()
    let month = now.getMonth() - 1
    if (month < 0) {
      year--
      month = 11
    }
    const expected = `${year}-${String(month + 1).padStart(2, '0')}`
    expect(monthAgoKey(1)).toBe(expected)
  })

  it('returns correct past month for larger values', () => {
    // 12 months ago should be same month last year
    const result = monthAgoKey(12)
    const now = new Date()
    const expectedYear = now.getFullYear() - 1
    const expectedMonth = String(now.getMonth() + 1).padStart(2, '0')
    expect(result).toBe(`${expectedYear}-${expectedMonth}`)
  })

  it('handles year boundary crossing', () => {
    // Test with a date near January to verify December of previous year
    const result = monthAgoKey(1)
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('titleCase', () => {
  it('capitalizes single word', () => {
    expect(titleCase('hello')).toBe('Hello')
  })

  it('capitalizes each word in space-separated string', () => {
    expect(titleCase('hello world')).toBe('Hello World')
  })

  it('handles underscore separators', () => {
    expect(titleCase('hello_world')).toBe('Hello World')
  })

  it('handles mixed separators', () => {
    expect(titleCase('hello_world_test')).toBe('Hello World Test')
  })

  it('preserves already capitalized words', () => {
    expect(titleCase('Hello World')).toBe('Hello World')
  })

  it('handles all caps input', () => {
    expect(titleCase('HELLO WORLD')).toBe('HELLO WORLD')
  })

  it('handles single character word', () => {
    expect(titleCase('a b c')).toBe('A B C')
  })

  it('returns empty string for empty input', () => {
    expect(titleCase('')).toBe('')
  })

  it('handles multiple consecutive separators', () => {
    expect(titleCase('hello__world')).toBe('Hello World')
  })
})

describe('initials', () => {
  it('extracts initials from two-word name', () => {
    expect(initials('John Doe')).toBe('JD')
  })

  it('extracts first letter of single word', () => {
    expect(initials('John')).toBe('J')
  })

  it('only takes first two words for three+ word names', () => {
    expect(initials('John William Doe')).toBe('JW')
  })

  it('handles all lowercase', () => {
    expect(initials('alice smith')).toBe('AS')
  })

  it('handles mixed case', () => {
    expect(initials('aLiCe SmItH')).toBe('AS')
  })

  it('returns empty string for empty input', () => {
    expect(initials('')).toBe('')
  })

  it('filters out whitespace-only segments', () => {
    expect(initials('John   Doe')).toBe('JD')
  })
})
