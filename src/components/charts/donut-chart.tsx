import { formatPercent, formatNumber } from '#/lib/format'

export function DonutChart({
  data,
  size = 180,
  thickness = 26,
  centerLabel,
  centerValue,
  formatValue = (v: number) => formatNumber(v),
}: {
  data: Array<{ label: string; value: number; color: string }>
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
  formatValue?: (value: number) => string
}) {
  const total = data.reduce((sum, d) => sum + Math.max(d.value, 0), 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius

  let offset = 0
  const segments = data.map((d) => {
    const fraction = total > 0 ? d.value / total : 0
    const segment = {
      ...d,
      fraction,
      dash: fraction * circumference,
      offset,
    }
    offset += fraction * circumference
    return segment
  })

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--line)"
            strokeWidth={thickness}
          />
          {segments.map((segment) =>
            segment.fraction > 0 ? (
              <circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={thickness}
                strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
                strokeDashoffset={-segment.offset}
              />
            ) : null,
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-[var(--sea-ink)]">
            {centerValue ?? formatValue(total)}
          </span>
          {centerLabel && (
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sea-ink-soft)]">
              {centerLabel}
            </span>
          )}
        </div>
      </div>
      <div className="w-full min-w-0 space-y-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="truncate font-medium text-[var(--sea-ink)]">{segment.label}</span>
            </span>
            <span className="flex-shrink-0 text-xs font-semibold text-[var(--sea-ink-soft)]">
              {formatValue(segment.value)} · {formatPercent(segment.fraction)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
