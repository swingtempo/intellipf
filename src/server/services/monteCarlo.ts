import { z } from 'zod'

export const retirementInputSchema = z.object({
  currentAge: z.number().min(16).max(90),
  retirementAge: z.number().min(18).max(99),
  lifeExpectancy: z.number().min(40).max(120),
  currentSavings: z.number().min(0).max(1_000_000_000),
  monthlyContribution: z.number().min(0).max(10_000_000),
  monthlyWithdrawal: z.number().min(0).max(10_000_000),
  expectedReturn: z.number().min(-0.1).max(0.5),
  volatility: z.number().min(0.01).max(0.5),
  inflation: z.number().min(0).max(0.15),
  simulationCount: z.number().min(100).max(5000).default(1000),
})

export type RetirementInput = z.infer<typeof retirementInputSchema>

export interface RetirementSeriesPoint {
  age: number
  p5: number
  p25: number
  p50: number
  p75: number
  p95: number
  mean: number
}

export interface RetirementResult {
  successRate: number
  medianPortfolioAtRetirement: number
  medianEndingBalance: number
  medianYearsOfRetirement: number
  medianShortfallAge: number | null
  failureRate: number
  series: RetirementSeriesPoint[]
}

export function runRetirementMonteCarlo(input: RetirementInput): RetirementResult {
  const {
    currentAge,
    retirementAge,
    lifeExpectancy,
    currentSavings,
    monthlyContribution,
    monthlyWithdrawal,
    expectedReturn,
    volatility,
    inflation,
    simulationCount,
  } = input

  const monthsToRetirement = Math.max((retirementAge - currentAge) * 12, 0)
  const monthsOfRetirement = Math.max((lifeExpectancy - retirementAge) * 12, 0)
  const totalMonths = monthsToRetirement + monthsOfRetirement

  const monthlyMu = (expectedReturn - Math.pow(volatility, 2) / 2) / 12
  const monthlySigma = volatility / Math.sqrt(12)
  const monthlyInflation = inflation / 12

  const percentiles = Array.from({ length: totalMonths + 1 }, () => new Array<number>(simulationCount))
  const endingBalances = new Array<number>(simulationCount)
  const retirementBalances = new Array<number>(simulationCount)
  const shortfallAges = new Array<number | null>(simulationCount)
  const yearsOfRetirement = new Array<number>(simulationCount)

  for (let sim = 0; sim < simulationCount; sim++) {
    let balance = currentSavings
    let nominalWithdrawal = monthlyWithdrawal
    let cumulativeInflation = 1
    let shortfallAge: number | null = null

    percentiles[0]![sim] = balance

    for (let month = 1; month <= totalMonths; month++) {
      cumulativeInflation *= 1 + monthlyInflation * (0.8 + Math.random() * 0.4)
      const inRetirement = month > monthsToRetirement

      if (inRetirement) {
        const withdrawal = nominalWithdrawal * cumulativeInflation
        balance -= withdrawal
        nominalWithdrawal *= 1 + monthlyInflation
      } else {
        balance += monthlyContribution
      }

      const z = boxMuller()
      const growth = Math.exp(monthlyMu + monthlySigma * z)
      balance *= growth

      if (balance < 0) {
        balance = 0
        if (inRetirement) {
          shortfallAge = shortfallAge ?? currentAge + Math.floor(month / 12)
        }
      }

      percentiles[month]![sim] = balance
    }

    endingBalances[sim] = balance
    retirementBalances[sim] = percentiles[monthsToRetirement]![sim]
    shortfallAges[sim] = shortfallAge
    yearsOfRetirement[sim] = shortfallAge != null ? (shortfallAge - retirementAge) : monthsOfRetirement / 12
  }

  const ages: number[] = []
  const series: RetirementSeriesPoint[] = []
  const step = Math.max(Math.floor(totalMonths / 12 / 5), 1)
  for (let month = 0; month <= totalMonths; month += step * 12) {
    const age = currentAge + Math.floor(month / 12)
    if (age > lifeExpectancy + 1) break
    const values = percentiles[month]!.slice().sort((a, b) => a - b)
    const q = (p: number) => percentile(values, p)
    series.push({
      age,
      p5: q(0.05),
      p25: q(0.25),
      p50: q(0.5),
      p75: q(0.75),
      p95: q(0.95),
      mean: values.reduce((a, b) => a + b, 0) / values.length,
    })
    ages.push(age)
  }
  if (series[series.length - 1]!.age < lifeExpectancy) {
    const last = totalMonths
    const values = percentiles[last]!.slice().sort((a, b) => a - b)
    const q = (p: number) => percentile(values, p)
    series.push({
      age: lifeExpectancy,
      p5: q(0.05),
      p25: q(0.25),
      p50: q(0.5),
      p75: q(0.75),
      p95: q(0.95),
      mean: values.reduce((a, b) => a + b, 0) / values.length,
    })
  }

  const sortedEnding = endingBalances.slice().sort((a, b) => a - b)
  const sortedRetirement = retirementBalances.slice().sort((a, b) => a - b)
  const validShortfallAges = shortfallAges.filter((a): a is number => a != null)
  const medianShortfallAge = validShortfallAges.length > 0 ? median(validShortfallAges) : null

  const retiredSims = simulationCount
  const failures = shortfallAges.filter((a) => a != null).length
  const successCount = retiredSims - failures

  return {
    successRate: successCount / retiredSims,
    failureRate: failures / retiredSims,
    medianPortfolioAtRetirement: percentile(sortedRetirement, 0.5),
    medianEndingBalance: percentile(sortedEnding, 0.5),
    medianYearsOfRetirement: median(yearsOfRetirement),
    medianShortfallAge,
    series,
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
  return sorted[index]!
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

let hasGaussianSpare = false
let gaussianSpare = 0

function boxMuller(): number {
  if (hasGaussianSpare) {
    hasGaussianSpare = false
    return gaussianSpare
  }
  let u = 0
  let v = 0
  let s = 0
  do {
    u = Math.random() * 2 - 1
    v = Math.random() * 2 - 1
    s = u * u + v * v
  } while (s >= 1 || s === 0)
  const mul = Math.sqrt((-2 * Math.log(s)) / s)
  gaussianSpare = v * mul
  hasGaussianSpare = true
  return u * mul
}
