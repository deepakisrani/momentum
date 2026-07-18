import type { Goal } from './types'

export const DEFAULT_PROTEIN_PER_KG: Record<Goal, number> = { cut: 2.2, maintain: 2.0, bulk: 1.8 }

export interface Macros {
  proteinG: number; carbG: number; fatG: number
  proteinKcal: number; carbKcal: number; fatKcal: number
}

/** Daily macro targets from calorie target + bodyweight + goal. `proteinPerKg` overrides the goal default. */
export function computeMacros(targetCalories: number, weightKg: number, goal: Goal, proteinPerKg?: number): Macros {
  const gPerKg = proteinPerKg ?? DEFAULT_PROTEIN_PER_KG[goal]
  const proteinG = Math.round(gPerKg * weightKg)
  const proteinKcal = proteinG * 4
  const fatKcal = Math.round(targetCalories * 0.25)
  const fatG = Math.round(fatKcal / 9)
  const carbKcal = Math.max(0, targetCalories - proteinKcal - fatKcal)
  const carbG = Math.round(carbKcal / 4)
  return { proteinG, carbG, fatG, proteinKcal, carbKcal, fatKcal }
}
