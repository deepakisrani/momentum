import { describe, it, expect } from 'vitest'
import { buildEnergySummary } from './energySummary'

describe('buildEnergySummary', () => {
  it('composes age, BMR, TDEE, and goal target', () => {
    const s = buildEnergySummary({
      sex: 'male', dob: new Date(1996, 5, 20), heightCm: 180, weightKg: 80,
      activityFactor: 1.2, goal: 'cut', today: new Date(2026, 5, 20),
    })
    expect(s.ageYears).toBe(30)
    expect(s.bmr).toBe(1780)
    expect(s.tdee).toBeCloseTo(2136, 5)
    expect(s.target).toBe(1709)
  })
})
