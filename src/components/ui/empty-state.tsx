import { type LucideIcon } from 'lucide-react'
import { cn } from '#/lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--line)] px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(79,184,178,0.14)] text-[var(--lagoon-deep)]">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <p className="text-base font-bold text-[var(--sea-ink)]">{title}</p>
      {description && <p className="max-w-md text-sm text-[var(--sea-ink-soft)]">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
