import { describe, it, expect } from 'vitest'
import { formatLastTime, exerciseStatus, buildSuggestionInput } from './sessionFormat'
import type { SetResult } from '../../domain/types'

describe('formatLastTime', () => {
  it('uses compact notation when all weights match', () => {
    const sets: SetResult[] = [{ weight: 25, reps: 8, rir: 2 }, { weight: 25, reps: 8, rir: 2 }, { weight: 25, reps: 7, rir: 1 }]
    expect(formatLastTime(sets)).toBe('25 × (8, 8, 7)')
  })
  it('lists per-set when weights differ', () => {
    const sets: SetResult[] = [{ weight: 25, reps: 8, rir: null }, { weight: 27.5, reps: 8, rir: null }]
    expect(formatLastTime(sets)).toBe('25×8 · 27.5×8')
  })
  it('returns null for no data', () => {
    expect(formatLastTime([])).toBeNull()
    expect(formatLastTime(null)).toBeNull()
  })
})

describe('exerciseStatus', () => {
  it('is not_started with zero sets', () => {
    expect(exerciseStatus(3, 0)).toBe('not_started')
  })
  it('is in_progress below target', () => {
    expect(exerciseStatus(3, 1)).toBe('in_progress')
  })
  it('is done at or above target', () => {
    expect(exerciseStatus(3, 3)).toBe('done')
    expect(exerciseStatus(3, 4)).toBe('done')
  })
  it('treats a zero target as done', () => {
    expect(exerciseStatus(0, 0)).toBe('done')
  })
})

describe('buildSuggestionInput', () => {
  it('assembles the suggestion-engine input from last performance + target + goal + deload', () => {
    const last: SetResult[] = [{ weight: 60, reps: 12, rir: 2 }]
    expect(buildSuggestionInput({ last, target: { repMin: 8, repMax: 12 }, goal: 'bulk', mechanic: 'compound', isDeload: false })).toEqual({
      lastSession: last, repRange: { min: 8, max: 12 }, goal: 'bulk', mechanic: 'compound', isDeload: false,
    })
  })
})
