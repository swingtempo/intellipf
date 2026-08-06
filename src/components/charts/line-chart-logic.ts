import { parseISO } from 'date-fns'

export interface LinePoint {
  label: string
  [key: string]: number | string
}

export function computeYAxisRange(
  allValues: number[],
): { minValue: number; maxValue: number; rangePadding: number } {
  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const range = rawMax - rawMin || 1
  const rangePadding = range * 0.05
  return {
    minValue: rawMin - rangePadding,
    maxValue: rawMax + rangePadding,
    rangePadding,
  }
}

export function computeLabelSpacing(
  dataLength: number,
  chartWidth: number,
  paddingLeft: number,
  paddingRight: number,
): number {
  if (dataLength <= 1) return 0
  const availableWidth = chartWidth - paddingLeft - paddingRight
  const minGap = 50
  return Math.max(1, Math.ceil(dataLength * minGap / availableWidth))
}

export function computeXAxisLabels(
  data: LinePoint[],
  labelSpacing: number,
  formatLabel: (label: string) => string,
): Array<{ index: number; show: boolean; label: string }> {
  if (labelSpacing === 0) return []
  return data.map((point, index) => ({
    index,
    label: formatLabel(point.label),
    show: index % labelSpacing === 0 || index === data.length - 1,
  }))
}

export function hasMultiYear(data: LinePoint[]): boolean {
  if (data.length < 2) return false
  const firstDate = parseISO(data[0]!.label)
  const lastDate = parseISO(data[data.length - 1]!.label)
  return Number.isFinite(firstDate.getTime()) && Number.isFinite(lastDate.getTime()) && firstDate.getFullYear() !== lastDate.getFullYear()
}
