import { format, parseISO } from 'date-fns'

export function formatCurrency(
  amount: number,
  currency = 'USD',
  opts: { signDisplay?: 'auto' | 'always' | 'never' } = {},
): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      signDisplay: opts.signDisplay ?? 'auto',
    }).format(amount)
  } catch {
    return `$${amount.toFixed(2)}`
  }
}

export function formatCompactCurrency(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount)
  } catch {
    return `$${amount.toFixed(0)}`
  }
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatDate(date: string | Date, fmt = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  if (Number.isNaN(d.getTime())) return String(date)
  return format(d, fmt)
}

export function formatMonthKey(month: string): string {
  const d = parseISO(`${month}-01`)
  if (Number.isNaN(d.getTime())) return month
  return format(d, 'MMMM yyyy')
}

export function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function currentMonthKey(): string {
  return format(new Date(), 'yyyy-MM')
}

export function monthAgoKey(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return format(d, 'yyyy-MM')
}

export function titleCase(value: string): string {
  return value
    .split(/[\s_]+/)
    .map((word) => (word.length ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ')
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('')
}
