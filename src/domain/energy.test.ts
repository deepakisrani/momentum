import { describe, it, expect } from 'vitest'
import { ageFromDate, mifflinStJeorBmr, tdee, calorieTarget, GOAL_CALORIE_ADJUSTMENT, ACTIVITY_FACTORS } from './energy'

describe('energy', () => {
  it('computes whole-year age, accounting for month/day', () => {
    expect(ageFromDate(new Date(1991, 0, 15), new Date(2026, 5, 20))).toBe(35)
    expect(ageFromDate(new Date(1991, 11, 31), new Date(2026, 5, 20))).toBe(34)
  })

  it('computes Mifflin–St Jeor BMR for male and female', () => {
    expect(mifflinStJeorBmr({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 })).toBe(1780)
    expect(mifflinStJeorBmr({ sex: 'female', weightKg: 65, heightCm: 165, ageYears: 30 })).toBeCloseTo(1370.25, 2)
  })

  it('computes TDEE from BMR and activity factor', () => {
    expect(tdee(1780, 1.2)).toBeCloseTo(2136, 5)
  })

  it('applies goal adjustment to the calorie target (rounded)', () => {
    expect(GOAL_CALORIE_ADJUSTMENT).toEqual({ cut: -0.2, bulk: 0.12, maintain: 0 })
    expect(calorieTarget(2136, 'maintain')).toBe(2136)
    expect(calorieTarget(2136, 'cut')).toBe(1709)
    expect(calorieTarget(2136, 'bulk')).toBe(2392)
  })

  it('counts the birthday itself as the new age', () => {
    expect(ageFromDate(new Date(1991, 5, 20), new Date(2026, 5, 20))).toBe(35)
  })

  it('exposes standard activity multipliers and composes with tdee', () => {
    expect(ACTIVITY_FACTORS.sedentary).toBe(1.2)
    expect(ACTIVITY_FACTORS.very_active).toBe(1.725)
    expect(tdee(1780, ACTIVITY_FACTORS.moderately_active)).toBeCloseTo(2759, 0)
  })
})
