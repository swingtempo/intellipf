import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-10 w-full appearance-none rounded-xl border border-[var(--chip-line)] bg-[var(--chip-bg)] bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2012%2012%27%3E%3Cpath%20fill=%27%23688b8e%27%20d=%27M6%208.5%201.5%204h9z%27/%3E%3C/svg%3E")] bg-[right_0.75rem_center] bg-no-repeat pr-9 pl-3.5 text-sm text-[var(--sea-ink)] transition focus:border-[var(--lagoon-deep)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)]/30',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    )
  },
)
