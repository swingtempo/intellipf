import { useCallback, useMemo, useRef, useState } from 'react'
import { useId } from 'react'
import { format, parseISO } from 'date-fns'
import { formatNumber } from '#/lib/format'
import { computeYAxisRange, computeLabelSpacing, computeXAxisLabels, hasMultiYear } from './line-chart-logic'

export interface LineSeries {
  key: string
  name: string
  color: string
}

const RANGE_OPTIONS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: 'YTD', ytd: true },
  { label: '1Y', days: 365 },
  { label: 'All', days: Infinity },
] as const

export type ChartRange = (typeof RANGE_OPTIONS)[number]['label']

export function LineChart({
  data,
  series,
  height = 280,
  formatValue = (v: number) => formatNumber(v),
  formatLabel = (label: string) => label,
  showLegend = true,
  showGrid = true,
}: {
  data: Array<{ label: string; [key: string]: number | string }>
  series: LineSeries[]
  height?: number
  formatValue?: (value: number) => string
  formatLabel?: (label: string) => string
  showLegend?: boolean
  showGrid?: boolean
}) {
  const gradientId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const width = 900
  const padding = { top: 16, right: 16, bottom: 48, left: 56 }

  const allValues = data.flatMap((point) =>
    series.map((s) => Number(point[s.key]) || 0),
  )

  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const { minValue, maxValue } = computeYAxisRange(allValues)
  const range = maxValue - minValue

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

  // Determine which x-axis labels to show to avoid overlap
  const labelSpacing = useMemo(() =>
    computeLabelSpacing(data.length, width, padding.left, padding.right),
    [data.length, width, padding.left, padding.right],
  )

  // Check if data spans multiple years to show year markers
  const hasMultiYearFlag = useMemo(() => hasMultiYear(data), [data])

  // Determine x-axis labels: show MM/DD, plus year when crossing years
  const xAxisLabels = useMemo(() =>
    computeXAxisLabels(data, labelSpacing, formatLabel),
    [data, labelSpacing, formatLabel],
  )

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || data.length === 0) return
    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = width / rect.width
    const mouseX = (e.clientX - rect.left) * scaleX
    const relX = mouseX - padding.left
    const index = Math.round((relX / chartWidth) * (data.length - 1))
    setHoverIndex(Math.max(0, Math.min(data.length - 1, index)))
  }, [data.length, width, padding.left, chartWidth])

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null)
  }, [])

  // Build a hit area for each data point to improve hover accuracy
  const hitAreas = useMemo(() => {
    if (data.length <= 1) return []
    const step = chartWidth / (data.length - 1)
    return data.map((_, i) => ({
      index: i,
      x: padding.left + i * step - step / 2,
      width: step,
    }))
  }, [data.length, chartWidth, padding.left])

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="img"
      >
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

        {/* Hover crosshair */}
        {hoverIndex != null && data.length > 0 && (
          <g>
            <line
              x1={xFor(hoverIndex)}
              x2={xFor(hoverIndex)}
              y1={padding.top}
              y2={padding.top + chartHeight}
              stroke="var(--sea-ink-soft)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            {series.map((s) => (
              <circle
                key={`${s.key}-hover`}
                cx={xFor(hoverIndex)}
                cy={yFor(Number(data[hoverIndex]![s.key]) || 0)}
                r="5"
                fill={s.color}
                stroke="var(--surface-strong)"
                strokeWidth="2"
              />
            ))}
          </g>
        )}

        {/* X-axis labels */}
        {xAxisLabels.map((pt) => (
          <g key={`${pt.label}-${pt.index}`}>
            {pt.show && (
              <>
                <text
                  x={xFor(pt.index)}
                  y={height - 28}
                  textAnchor="middle"
                  className="fill-[var(--sea-ink-soft)]"
                  fontSize="10"
                >
                  {pt.label}
                </text>
                {hasMultiYearFlag && (
                  <text
                    x={xFor(pt.index)}
                    y={height - 14}
                    textAnchor="middle"
                    className="fill-[var(--sea-ink-soft)]"
                    fontSize="9"
                    opacity="0.6"
                  >
                    {format(parseISO(pt.label), 'yyyy')}
                  </text>
                )}
              </>
            )}
          </g>
        ))}

        {/* Invisible hit areas for hover */}
        {hitAreas.map((area) => (
          <rect
            key={area.index}
            x={area.x}
            y={padding.top}
            width={area.width}
            height={chartHeight}
            fill="transparent"
          />
        ))}

        {/* Tooltip */}
        {hoverIndex != null && data.length > 0 && (
          <g>
            {(() => {
              const pt = data[hoverIndex]!
              const labelX = xFor(hoverIndex)
              // Position tooltip above or below based on available space
              const topEdge = padding.top
              const bottomEdge = padding.top + chartHeight - 40
              let tooltipY = topEdge + 8
              for (const s of series) {
                const val = Number(pt[s.key]) || 0
                const yVal = yFor(val)
                if (yVal < tooltipY + 60) tooltipY = Math.max(topEdge + 8, yVal - 50)
              }
              // Keep tooltip within bounds
              tooltipY = Math.min(tooltipY, bottomEdge)

              const tooltipWidth = 120
              let tooltipX = labelX - tooltipWidth / 2
              if (tooltipX < 4) tooltipX = 4
              if (tooltipX + tooltipWidth > width - 4) tooltipX = width - tooltipWidth - 4

              return (
                <>
                  <rect
                    x={tooltipX}
                    y={tooltipY}
                    width={tooltipWidth}
                    height={series.length * 18 + 24}
                    rx="4"
                    fill="var(--surface-strong)"
                    stroke="var(--line)"
                    strokeWidth="1"
                    opacity="0.95"
                  />
                  <text
                    x={tooltipX + tooltipWidth / 2}
                    y={tooltipY + 16}
                    textAnchor="middle"
                    className="fill-[var(--sea-ink)]"
                    fontSize="10"
                    fontWeight="600"
                  >
                    {formatLabel(pt.label)}
                  </text>
                  {series.map((s, i) => (
                    <g key={s.key}>
                      <circle cx={tooltipX + 14} cy={tooltipY + 32 + i * 18} r="4" fill={s.color} />
                      <text
                        x={tooltipX + 24}
                        y={tooltipY + 36 + i * 18}
                        className="fill-[var(--sea-ink)]"
                        fontSize="11"
                      >
                        {formatValue(Number(pt[s.key]) || 0)}
                      </text>
                    </g>
                  ))}
                </>
              )
            })()}
          </g>
        )}
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

export function RangeSelector({
  value,
  onChange,
}: {
  value: ChartRange
  onChange: (range: ChartRange) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--line)] p-0.5 text-xs font-medium">
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.label}
          onClick={() => onChange(opt.label)}
          className={`rounded-md px-3 py-1 transition-colors ${
            value === opt.label
              ? 'bg-[var(--lagoon-deep)] text-white'
              : 'text-[var(--sea-ink-soft)] hover:bg-[var(--surface-visited)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
