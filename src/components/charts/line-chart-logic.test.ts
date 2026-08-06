import { describe, it, expect } from 'vitest'
import { computeYAxisRange, computeLabelSpacing, computeXAxisLabels, hasMultiYear } from './line-chart-logic'

describe('computeYAxisRange', () => {
  it('adds 5% padding above and below data range', () => {
    const result = computeYAxisRange([100, 200])
    expect(result.minValue).toBe(95)
    expect(result.maxValue).toBe(205)
    expect(result.rangePadding).toBe(5)
  })

  it('does not start at zero when all values are high', () => {
    const result = computeYAxisRange([180, 190, 200])
    // range = 20, padding = 1
    expect(result.minValue).toBe(179)
    expect(result.maxValue).toBe(201)
  })

  it('handles single value', () => {
    const result = computeYAxisRange([50])
    // range is 0 so falls back to 1; padding = 0.05
    expect(result.minValue).toBe(49.95)
    expect(result.maxValue).toBe(50.05)
  })

  it('handles negative values', () => {
    const result = computeYAxisRange([-10, -5])
    expect(result.minValue).toBe(-10.25)
    expect(result.maxValue).toBe(-4.75)
  })

  it('handles mixed positive and negative', () => {
    const result = computeYAxisRange([-100, 100])
    // range = 200, padding = 10
    expect(result.minValue).toBe(-110)
    expect(result.maxValue).toBe(110)
  })

  it('handles zero range (all same values)', () => {
    const result = computeYAxisRange([42, 42, 42])
    // range falls back to 1, padding = 0.05
    expect(result.minValue).toBe(41.95)
    expect(result.maxValue).toBe(42.05)
  })

  it('handles large values', () => {
    const result = computeYAxisRange([1_000_000, 1_100_000])
    // range = 100_000, padding = 5_000
    expect(result.minValue).toBe(995_000)
    expect(result.maxValue).toBe(1_105_000)
  })
})

describe('computeLabelSpacing', () => {
  it('returns 0 for single or fewer data points', () => {
    expect(computeLabelSpacing(1, 800, 56, 16)).toBe(0)
    expect(computeLabelSpacing(0, 800, 56, 16)).toBe(0)
  })

  it('returns step of 1 when data is sparse enough', () => {
    // 4 points in ~800px — plenty of room
    const result = computeLabelSpacing(4, 800, 56, 16)
    expect(result).toBe(1)
  })

  it('increases step when data is dense', () => {
    // 20 points in ~800px — need to skip some labels
    const result = computeLabelSpacing(20, 800, 56, 16)
    expect(result).toBeGreaterThan(1)
  })

  it('scales with chart width', () => {
    // Same data in a narrow chart vs wide chart
    const narrow = computeLabelSpacing(20, 400, 56, 16)
    const wide = computeLabelSpacing(20, 900, 56, 16)
    expect(narrow).toBeGreaterThan(wide)
  })
})

describe('computeXAxisLabels', () => {
  it('returns empty array when labelSpacing is 0', () => {
    const labels = computeXAxisLabels([{ label: '2024-01-01' }], 0, (l) => l)
    expect(labels).toEqual([])
  })

  it('marks every nth label for display and always shows last', () => {
    const data = [
      { label: '2024-01-01' },
      { label: '2024-02-01' },
      { label: '2024-03-01' },
      { label: '2024-04-01' },
      { label: '2024-05-01' },
    ]
    const labels = computeXAxisLabels(data, 2, (l) => l)
    expect(labels[0]!.show).toBe(true)   // index 0
    expect(labels[1]!.show).toBe(false)  // index 1
    expect(labels[2]!.show).toBe(true)   // index 2
    expect(labels[3]!.show).toBe(false)  // index 3
    expect(labels[4]!.show).toBe(true)   // last index always shown
  })

  it('applies formatLabel to each label', () => {
    const data = [{ label: '2024-06-15' }, { label: '2024-07-20' }]
    const labels = computeXAxisLabels(data, 1, (l) => l.toUpperCase())
    expect(labels[0]!.label).toBe('2024-06-15')
  })
})

describe('hasMultiYear', () => {
  it('returns false for single data point', () => {
    expect(hasMultiYear([{ label: '2024-06-15' }])).toBe(false)
  })

  it('returns false when all dates are in the same year', () => {
    const data = [
      { label: '2024-01-15' },
      { label: '2024-06-15' },
      { label: '2024-12-31' },
    ]
    expect(hasMultiYear(data)).toBe(false)
  })

  it('returns true when dates span multiple years', () => {
    const data = [
      { label: '2023-12-15' },
      { label: '2024-06-15' },
    ]
    expect(hasMultiYear(data)).toBe(true)
  })

  it('returns false for invalid date strings', () => {
    const data = [
      { label: 'not-a-date' },
      { label: '2024-06-15' },
    ]
    expect(hasMultiYear(data)).toBe(false)
  })

  it('returns false when first or last date is invalid', () => {
    const data = [
      { label: '2024-01-01' },
      { label: 'invalid' },
    ]
    expect(hasMultiYear(data)).toBe(false)
  })
})
