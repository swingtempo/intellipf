import { createServerFn } from '@tanstack/react-start'
import {
  runRetirementMonteCarlo,
  retirementInputSchema,
} from '../services/monteCarlo'

export const getRetirementProjection = createServerFn({ method: 'POST' })
  .validator(retirementInputSchema)
  .handler(async ({ data }) => {
    return runRetirementMonteCarlo(data)
  })
