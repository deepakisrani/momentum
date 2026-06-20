import type { Sex, Goal } from '../../domain/types'
import { ageFromDate, mifflinStJeorBmr, tdee, calorieTarget } from '../../domain/energy'

export interface EnergySummaryInput {
  sex: Sex
  dob: Date
  heightCm: number
  weightKg: number
  activityFactor: number
  goal: Goal
  today: Date
}

export interface EnergySummary {
  ageYears: number
  bmr: number
  tdee: number
  target: number
}

export function buildEnergySummary(input: EnergySummaryInput): EnergySummary {
  const ageYears = ageFromDate(input.dob, input.today)
  const bmr = mifflinStJeorBmr({ sex: input.sex, weightKg: input.weightKg, heightCm: input.heightCm, ageYears })
  const tdeeValue = tdee(bmr, input.activityFactor)
  return { ageYears, bmr, tdee: tdeeValue, target: calorieTarget(tdeeValue, input.goal) }
}
