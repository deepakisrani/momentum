import { describe, it, expect } from 'vitest'
import { isOnboardingComplete } from './onboardingStatus'
import type { ProfileRow, WeightLogRow, GoalLogRow } from '../../data/rows'

const profile = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  id: 'u1', display_name: 'D', sex: 'male', date_of_birth: '1991-06-20', height_cm: 180,
  units_pref: 'metric', baseline_activity_level: 1.55, created_at: '2026-06-20T00:00:00Z', ...over,
})
const weight: WeightLogRow = { id: 'w1', user_id: 'u1', logged_on: '2026-06-20', weight_kg: 82 }
const goal: GoalLogRow = { id: 'g1', user_id: 'u1', effective_from: '2026-06-20', goal: 'cut' }

describe('isOnboardingComplete', () => {
  it('is true when profile basics + a weight + a goal all exist', () => {
    expect(isOnboardingComplete(profile(), weight, goal)).toBe(true)
  })
  it('is false when the profile is missing', () => {
    expect(isOnboardingComplete(null, weight, goal)).toBe(false)
  })
  it.each(['sex', 'date_of_birth', 'height_cm'] as const)('is false when %s is null', (fieldName) => {
    expect(isOnboardingComplete(profile({ [fieldName]: null }), weight, goal)).toBe(false)
  })
  it('is false when there is no weight or no goal', () => {
    expect(isOnboardingComplete(profile(), null, goal)).toBe(false)
    expect(isOnboardingComplete(profile(), weight, null)).toBe(false)
  })
})
