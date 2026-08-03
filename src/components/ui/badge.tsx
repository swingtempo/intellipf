import { type HTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const tones: Record<BadgeTone, string> = {
  default: 'bg-[rgba(79,184,178,0.16)] text-[var(--lagoon-deep)]',
  success: 'bg-[rgba(47,106,74,0.14)] text-[var(--palm)]',
  warning: 'bg-amber-500/15 text-amber-600',
  danger: 'bg-red-500/15 text-red-600',
  neutral: 'bg-[rgba(23,58,64,0.08)] text-[var(--sea-ink-soft)]',
  info: 'bg-sky-500/15 text-sky-600',
}

export function Badge({
  tone = 'default',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
