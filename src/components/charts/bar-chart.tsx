import { formatNumber } from '#/lib/format'

export function BarChart({
  data,
  height = 260,
  color = 'var(--lagoon-deep)',
  formatValue = (v: number) => formatNumber(v),
}: {
  data: Array<{ label: string; value: number }>
  height?: number
  color?: string
  formatValue?: (value: number) => string
}) {
  const width = 900
  const padding = { top: 20, right: 8, bottom: 28, left: 48 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const maxValue = Math.max(...data.map((d) => d.value), 1)
  const barGap = 8
  const barWidth = Math.max((chartWidth - barGap * (data.length - 1)) / Math.max(data.length, 1), 2)

  const yFor = (value: number) => padding.top + chartHeight - (value / maxValue) * chartHeight

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const y = padding.top + chartHeight - fraction * chartHeight
        return (
          <g key={fraction}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="var(--line)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <text
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
              className="fill-[var(--sea-ink-soft)]"
              fontSize="11"
            >
              {formatValue(maxValue * fraction)}
            </text>
          </g>
        )
      })}
      {data.map((d, index) => {
        const x = padding.left + index * (barWidth + barGap)
        const y = yFor(d.value)
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(padding.top + chartHeight - y, 1)}
              rx={Math.min(6, barWidth / 3)}
              fill={color}
              opacity={0.85}
            />
            <text
              x={x + barWidth / 2}
              y={padding.top + chartHeight + 16}
              textAnchor="middle"
              className="fill-[var(--sea-ink-soft)]"
              fontSize="11"
            >
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
