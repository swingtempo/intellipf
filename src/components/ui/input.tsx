import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-xl border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3.5 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)]/60 transition focus:border-[var(--lagoon-deep)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)]/30',
          className,
        )}
        {...props}
      />
    )
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-xl border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3.5 py-2.5 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)]/60 transition focus:border-[var(--lagoon-deep)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)]/30',
        className,
      )}
      {...props}
    />
  )
})

export const Label = forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      className={cn('mb-1.5 block text-sm font-semibold text-[var(--sea-ink)]', className)}
      {...props}
    />
  )
})
