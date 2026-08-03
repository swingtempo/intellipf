import { cn } from '#/lib/utils'

export function Progress({
  value,
  tone = 'default',
  className,
}: {
  value: number
  tone?: 'default' | 'warning' | 'danger' | 'success'
  className?: string
}) {
  const clamped = Math.max(0, Math.min(1, value))
  const color =
    tone === 'danger'
      ? 'bg-red-500'
      : tone === 'warning'
        ? 'bg-amber-500'
        : tone === 'success'
          ? 'bg-[var(--palm)]'
          : 'bg-[var(--lagoon-deep)]'
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-[rgba(23,58,64,0.1)]', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  )
}
