import { type LucideIcon } from 'lucide-react'
import { Card } from './card'
import { cn } from '#/lib/utils'

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  trendDirection,
  className,
}: {
  label: string
  value: string
  sub?: string
  icon?: LucideIcon
  trend?: string
  trendDirection?: 'up' | 'down' | 'flat'
  className?: string
}) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--sea-ink-soft)]">
            {label}
          </p>
          <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-[var(--sea-ink)]">
            {value}
          </p>
          {sub && <p className="mt-1 truncate text-xs text-[var(--sea-ink-soft)]">{sub}</p>}
          {trend && (
            <p
              className={cn(
                'mt-1.5 text-xs font-semibold',
                trendDirection === 'up' && 'text-[var(--palm)]',
                trendDirection === 'down' && 'text-red-500',
                trendDirection === 'flat' && 'text-[var(--sea-ink-soft)]',
              )}
            >
              {trend}
            </p>
          )}
        </div>
        {Icon && (
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[rgba(79,184,178,0.14)] text-[var(--lagoon-deep)]">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Card>
  )
}
