import type { Sex, Goal } from './types'

export interface BmrInput {
  sex: Sex
  weightKg: number
  heightCm: number
  ageYears: number
}

/** Whole years between dob and `on`, decrementing if the birthday hasn't occurred yet. */
export function ageFromDate(dob: Date, on: Date): number {
  let age = on.getFullYear() - dob.getFullYear()
  const monthDelta = on.getMonth() - dob.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && on.getDate() < dob.getDate())) age--
  return age
}

export function mifflinStJeorBmr({ sex, weightKg, heightCm, ageYears }: BmrInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears
  return sex === 'male' ? base + 5 : base - 161
}

export function tdee(bmr: number, activityFactor: number): number {
  return bmr * activityFactor
}

export const GOAL_CALORIE_ADJUSTMENT: Record<Goal, number> = {
  cut: -0.2,
  bulk: 0.12,
  maintain: 0,
}

export function calorieTarget(tdeeValue: number, goal: Goal): number {
  return Math.round(tdeeValue * (1 + GOAL_CALORIE_ADJUSTMENT[goal]))
}
