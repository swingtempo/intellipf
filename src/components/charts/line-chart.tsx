import { useId } from 'react'
import { formatNumber } from '#/lib/format'

export interface LineSeries {
  key: string
  name: string
  color: string
}

export function LineChart({
  data,
  series,
  height = 280,
  formatValue = (v: number) => formatNumber(v),
  showLegend = true,
  showGrid = true,
}: {
  data: Array<{ label: string; [key: string]: number | string }>
  series: LineSeries[]
  height?: number
  formatValue?: (value: number) => string
  showLegend?: boolean
  showGrid?: boolean
}) {
  const gradientId = useId()
  const width = 900
  const padding = { top: 16, right: 16, bottom: 28, left: 56 }

  const allValues = data.flatMap((point) =>
    series.map((s) => Number(point[s.key]) || 0),
  )
  const maxValue = Math.max(...allValues, 1)
  const minValue = Math.min(...allValues, 0)
  const range = maxValue - minValue || 1

  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const xFor = (index: number) =>
    padding.left + (data.length <= 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth)
  const yFor = (value: number) =>
    padding.top + ((maxValue - value) / range) * chartHeight

  const pathFor = (key: string) =>
    data
      .map((point, index) => {
        const x = xFor(index)
        const y = yFor(Number(point[key]) || 0)
        return `${index === 0 ? 'M' : 'L'}${x},${y}`
      })
      .join(' ')

  const areaFor = (key: string) =>
    `${pathFor(key)} L${xFor(data.length - 1)},${padding.top + chartHeight} L${xFor(0)},${padding.top + chartHeight} Z`

  const gridLines = 5
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) => {
    const value = minValue + (range * i) / gridLines
    return { value, y: yFor(value) }
  })

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {showGrid &&
          yTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={tick.y}
                y2={tick.y}
                stroke="var(--line)"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              <text
                x={padding.left - 8}
                y={tick.y + 4}
                textAnchor="end"
                className="fill-[var(--sea-ink-soft)]"
                fontSize="11"
              >
                {formatValue(tick.value)}
              </text>
            </g>
          ))}

        {series.map((s, i) => (
          <path key={s.key} d={areaFor(s.key)} fill={`url(#${gradientId}-${i})`} />
        ))}
        {series.map((s) => (
          <path
            key={s.key}
            d={pathFor(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {data.length > 0 &&
          series.map((s) => (
            <circle
              key={`${s.key}-last`}
              cx={xFor(data.length - 1)}
              cy={yFor(Number(data[data.length - 1]![s.key]) || 0)}
              r="4"
              fill={s.color}
              stroke="var(--surface-strong)"
              strokeWidth="2"
            />
          ))}

        {data.map((point, index) => (
          <text
            key={`${point.label}-${index}`}
            x={xFor(index)}
            y={height - 8}
            textAnchor="middle"
            className="fill-[var(--sea-ink-soft)]"
            fontSize="11"
          >
            {point.label}
          </text>
        ))}
      </svg>
      {showLegend && series.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sea-ink-soft)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
