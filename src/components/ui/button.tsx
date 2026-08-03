import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'subtle'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  default:
    'bg-[var(--lagoon-deep)] text-white shadow-sm hover:bg-[var(--lagoon)] disabled:opacity-60',
  outline:
    'border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--sea-ink)] hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)]',
  ghost:
    'text-[var(--sea-ink-soft)] hover:bg-[rgba(79,184,178,0.12)] hover:text-[var(--sea-ink)]',
  destructive: 'bg-red-600/90 text-white hover:bg-red-600',
  subtle:
    'bg-[rgba(79,184,178,0.14)] text-[var(--lagoon-deep)] hover:bg-[rgba(79,184,178,0.22)]',
}

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2',
  icon: 'h-9 w-9',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lagoon)] disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        loading && 'cursor-wait',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
})

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        className ?? 'h-5 w-5',
      )}
      aria-label="Loading"
    />
  )
}
