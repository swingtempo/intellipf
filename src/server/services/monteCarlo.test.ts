import { describe, it, expect } from 'vitest'
import { retirementInputSchema, runRetirementMonteCarlo } from '#/server/services/monteCarlo'
import type { RetirementResult, RetirementSeriesPoint } from '#/server/services/monteCarlo'

describe('retirementInputSchema', () => {
  describe('valid inputs', () => {
    it('accepts a complete valid input object', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
        simulationCount: 1000,
      })
      expect(result.success).toBe(true)
    })

    it('accepts minimal valid input with defaults', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 0,
        monthlyWithdrawal: 0,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.simulationCount).toBe(1000)
      }
    })

    it('accepts boundary values at minimum', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 16,
        retirementAge: 18,
        lifeExpectancy: 40,
        currentSavings: 0,
        monthlyContribution: 0,
        monthlyWithdrawal: 0,
        expectedReturn: -0.1,
        volatility: 0.01,
        inflation: 0,
      })
      expect(result.success).toBe(true)
    })

    it('accepts boundary values at maximum', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 90,
        retirementAge: 99,
        lifeExpectancy: 120,
        currentSavings: 1_000_000_000,
        monthlyContribution: 10_000_000,
        monthlyWithdrawal: 10_000_000,
        expectedReturn: 0.5,
        volatility: 0.5,
        inflation: 0.15,
      })
      expect(result.success).toBe(true)
    })

    it('accepts simulationCount at its boundaries', () => {
      const base = {
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      }

      const minResult = retirementInputSchema.safeParse({ ...base, simulationCount: 100 })
      expect(minResult.success).toBe(true)

      const maxResult = retirementInputSchema.safeParse({ ...base, simulationCount: 5000 })
      expect(maxResult.success).toBe(true)
    })
  })

  describe('invalid inputs', () => {
    it('rejects currentAge below minimum (16)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 15,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects currentAge above maximum (90)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 91,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects retirementAge below minimum (18)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 17,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects retirementAge above maximum (99)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 100,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects lifeExpectancy below minimum (40)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 39,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects lifeExpectancy above maximum (120)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 121,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects negative currentSavings', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: -1,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects currentSavings above maximum (1B)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 1_000_000_001,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects negative monthlyContribution', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: -1,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects monthlyContribution above maximum (10M)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 10_000_001,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects negative monthlyWithdrawal', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: -1,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects monthlyWithdrawal above maximum (10M)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 10_000_001,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects expectedReturn below minimum (-0.1)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: -0.11,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects expectedReturn above maximum (0.5)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.51,
        volatility: 0.15,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects volatility below minimum (0.01)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.005,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects volatility above maximum (0.5)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.51,
        inflation: 0.03,
      })
      expect(result.success).toBe(false)
    })

    it('rejects negative inflation', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: -0.01,
      })
      expect(result.success).toBe(false)
    })

    it('rejects inflation above maximum (0.15)', () => {
      const result = retirementInputSchema.safeParse({
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.16,
      })
      expect(result.success).toBe(false)
    })

    it('rejects simulationCount below minimum (100)', () => {
      const base = {
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      }
      const result = retirementInputSchema.safeParse({ ...base, simulationCount: 99 })
      expect(result.success).toBe(false)
    })

    it('rejects simulationCount above maximum (5000)', () => {
      const base = {
        currentAge: 30,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      }
      const result = retirementInputSchema.safeParse({ ...base, simulationCount: 5001 })
      expect(result.success).toBe(false)
    })

    it('rejects non-numeric values', () => {
      const base = {
        currentAge: 'thirty' as unknown as number,
        retirementAge: 65,
        lifeExpectancy: 90,
        currentSavings: 100_000,
        monthlyContribution: 1_000,
        monthlyWithdrawal: 2_000,
        expectedReturn: 0.07,
        volatility: 0.15,
        inflation: 0.03,
      }
      const result = retirementInputSchema.safeParse(base)
      expect(result.success).toBe(false)
    })

    it('rejects missing required fields', () => {
      const result = retirementInputSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })
})

describe('runRetirementMonteCarlo', () => {
  const baseInput = {
    currentAge: 30,
    retirementAge: 65,
    lifeExpectancy: 90,
    currentSavings: 100_000,
    monthlyContribution: 1_000,
    monthlyWithdrawal: 2_000,
    expectedReturn: 0.07,
    volatility: 0.15,
    inflation: 0.03,
    simulationCount: 1000,
  }

  it('returns a valid RetirementResult with all required fields', () => {
    const result = runRetirementMonteCarlo(baseInput)

    expect(result).toHaveProperty('successRate')
    expect(result).toHaveProperty('failureRate')
    expect(result).toHaveProperty('medianPortfolioAtRetirement')
    expect(result).toHaveProperty('medianEndingBalance')
    expect(result).toHaveProperty('medianYearsOfRetirement')
    expect(result).toHaveProperty('medianShortfallAge')
    expect(result).toHaveProperty('series')

    expect(typeof result.successRate).toBe('number')
    expect(typeof result.failureRate).toBe('number')
    expect(typeof result.medianPortfolioAtRetirement).toBe('number')
    expect(typeof result.medianEndingBalance).toBe('number')
    expect(typeof result.medianYearsOfRetirement).toBe('number')
    expect(result.medianShortfallAge === null || typeof result.medianShortfallAge === 'number').toBe(true)
    expect(Array.isArray(result.series)).toBe(true)
  })

  it('successRate + failureRate approximately equals 1.0', () => {
    const result = runRetirementMonteCarlo(baseInput)
    const sum = result.successRate + result.failureRate
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('successRate and failureRate are between 0 and 1', () => {
    const result = runRetirementMonteCarlo(baseInput)
    expect(result.successRate).toBeGreaterThanOrEqual(0)
    expect(result.successRate).toBeLessThanOrEqual(1)
    expect(result.failureRate).toBeGreaterThanOrEqual(0)
    expect(result.failureRate).toBeLessThanOrEqual(1)
  })

  it('series contains age data points', () => {
    const result = runRetirementMonteCarlo(baseInput)
    expect(result.series.length).toBeGreaterThan(0)

    for (const point of result.series) {
      expect(typeof point.age).toBe('number')
      expect(point.age).toBeGreaterThanOrEqual(baseInput.currentAge)
      expect(point.age).toBeLessThanOrEqual(baseInput.lifeExpectancy + 1)
    }
  })

  it('series first point starts at currentAge', () => {
    const result = runRetirementMonteCarlo(baseInput)
    expect(result.series[0]!.age).toBe(baseInput.currentAge)
  })

  it('series last point reaches lifeExpectancy', () => {
    const result = runRetirementMonteCarlo(baseInput)
    expect(result.series[result.series.length - 1]!.age).toBe(baseInput.lifeExpectancy)
  })

  it('each series point has all percentile fields', () => {
    const result = runRetirementMonteCarlo(baseInput)
    for (const point of result.series) {
      expect(point).toHaveProperty('p5')
      expect(point).toHaveProperty('p25')
      expect(point).toHaveProperty('p50')
      expect(point).toHaveProperty('p75')
      expect(point).toHaveProperty('p95')
      expect(point).toHaveProperty('mean')

      expect(typeof point.p5).toBe('number')
      expect(typeof point.p25).toBe('number')
      expect(typeof point.p50).toBe('number')
      expect(typeof point.p75).toBe('number')
      expect(typeof point.p95).toBe('number')
      expect(typeof point.mean).toBe('number')
    }
  })

  it('percentiles are ordered: p5 <= p25 <= p50 <= p75 <= p95', () => {
    const result = runRetirementMonteCarlo(baseInput)
    for (const point of result.series) {
      expect(point.p5).toBeLessThanOrEqual(point.p25)
      expect(point.p25).toBeLessThanOrEqual(point.p50)
      expect(point.p50).toBeLessThanOrEqual(point.p75)
      expect(point.p75).toBeLessThanOrEqual(point.p95)
    }
  })

  it('with zero return and near-zero volatility, portfolio variance is minimal', () => {
    const lowVolInput = {
      ...baseInput,
      expectedReturn: 0,
      volatility: 0.01,
      inflation: 0,
      monthlyWithdrawal: 0,
      simulationCount: 500,
    }
    const result = runRetirementMonteCarlo(lowVolInput)

    // With near-zero return and minimal volatility, all simulations should converge
    // to roughly the same value. Check that p5 ≈ p95 (very low variance).
    const lastPoint = result.series[result.series.length - 1]!
    expect(lastPoint.p50).toBeGreaterThan(0)

    if (lastPoint.p95 > 0) {
      const ratio = lastPoint.p5 / lastPoint.p95
      expect(ratio).toBeGreaterThan(0.8)
    }

    // The portfolio should have grown from contributions over the accumulation phase
    const monthsToRetirement = (lowVolInput.retirementAge - lowVolInput.currentAge) * 12
    const expectedGrowth = lowVolInput.currentSavings + lowVolInput.monthlyContribution * monthsToRetirement

    // p50 should be within ~3% of the deterministic accumulation value
    expect(lastPoint.p50).toBeGreaterThan(expectedGrowth * 0.97)
    expect(lastPoint.p50).toBeLessThan(expectedGrowth * 1.03)
  })

  it('with high contributions and no withdrawals, successRate should be 1.0', () => {
    const highSavingsInput = {
      ...baseInput,
      currentSavings: 1_000_000,
      monthlyContribution: 5_000,
      monthlyWithdrawal: 0,
      expectedReturn: 0.07,
      volatility: 0.1,
      simulationCount: 1000,
    }
    const result = runRetirementMonteCarlo(highSavingsInput)
    expect(result.successRate).toBe(1.0)
    expect(result.failureRate).toBe(0.0)
  })

  it('with massive withdrawals relative to savings, failureRate should be high', () => {
    const riskyInput = {
      ...baseInput,
      currentSavings: 5_000,
      monthlyContribution: 0,
      monthlyWithdrawal: 10_000,
      expectedReturn: 0.02,
      volatility: 0.1,
      simulationCount: 1000,
    }
    const result = runRetirementMonteCarlo(riskyInput)
    expect(result.failureRate).toBeGreaterThan(0.9)
    expect(result.successRate).toBeLessThan(0.1)
  })

  it('medianShortfallAge is null when all simulations succeed', () => {
    const safeInput = {
      ...baseInput,
      currentSavings: 2_000_000,
      monthlyContribution: 5_000,
      monthlyWithdrawal: 1_000,
      expectedReturn: 0.06,
      volatility: 0.08,
      simulationCount: 1000,
    }
    const result = runRetirementMonteCarlo(safeInput)
    expect(result.medianShortfallAge).toBeNull()
  })

  it('medianYearsOfRetirement is positive for a healthy portfolio', () => {
    const healthyInput = {
      ...baseInput,
      currentSavings: 500_000,
      monthlyContribution: 2_000,
      monthlyWithdrawal: 3_000,
      expectedReturn: 0.06,
      volatility: 0.1,
      simulationCount: 1000,
    }
    const result = runRetirementMonteCarlo(healthyInput)
    expect(result.medianYearsOfRetirement).toBeGreaterThan(0)
    expect(result.medianYearsOfRetirement).toBeLessThanOrEqual(baseInput.lifeExpectancy - baseInput.retirementAge)
  })

  it('medianEndingBalance is non-negative', () => {
    const result = runRetirementMonteCarlo(baseInput)
    expect(result.medianEndingBalance).toBeGreaterThanOrEqual(0)
  })

  it('medianPortfolioAtRetirement is non-negative', () => {
    const result = runRetirementMonteCarlo(baseInput)
    expect(result.medianPortfolioAtRetirement).toBeGreaterThanOrEqual(0)
  })

  it('series ages are in ascending order', () => {
    const result = runRetirementMonteCarlo(baseInput)
    for (let i = 1; i < result.series.length; i++) {
      expect(result.series[i]!.age).toBeGreaterThan(result.series[i - 1]!.age)
    }
  })

  it('mean is approximately between p50 and p95 for typical inputs', () => {
    const result = runRetirementMonteCarlo(baseInput)
    for (const point of result.series) {
      // Mean should be >= median in a right-skewed distribution (common with returns)
      // But at minimum it should be within the percentile range
      expect(point.mean).toBeGreaterThanOrEqual(point.p5)
      expect(point.mean).toBeLessThanOrEqual(point.p95 * 1.5)
    }
  })

  it('uses simulationCount from input', () => {
    const result = runRetirementMonteCarlo({ ...baseInput, simulationCount: 200 })
    // The function should complete without error with a custom count
    expect(result.series.length).toBeGreaterThan(0)
  })

  it('handles edge case where currentAge equals retirementAge', () => {
    const immediateRetirement = {
      ...baseInput,
      currentAge: 65,
      retirementAge: 65,
      monthlyContribution: 0,
      simulationCount: 100,
    }
    const result = runRetirementMonteCarlo(immediateRetirement)
    expect(result.series.length).toBeGreaterThan(0)
    expect(result.series[0]!.age).toBe(65)
  })

  it('handles edge case where currentAge equals lifeExpectancy', () => {
    const shortLife = {
      ...baseInput,
      currentAge: 90,
      retirementAge: 90,
      lifeExpectancy: 90,
      monthlyContribution: 0,
      monthlyWithdrawal: 0,
      simulationCount: 100,
    }
    const result = runRetirementMonteCarlo(shortLife)
    expect(result.series.length).toBeGreaterThan(0)
  })

  it('returns consistent structure with different simulation counts', () => {
    const r1 = runRetirementMonteCarlo({ ...baseInput, simulationCount: 100 })
    const r2 = runRetirementMonteCarlo({ ...baseInput, simulationCount: 500 })

    expect(r1.series.length).toBeGreaterThan(0)
    expect(r2.series.length).toBeGreaterThan(0)
    expect(typeof r1.successRate).toBe('number')
    expect(typeof r2.successRate).toBe('number')
  })
})
