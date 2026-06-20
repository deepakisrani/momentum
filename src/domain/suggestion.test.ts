import { describe, it, expect } from 'vitest'
import { suggestNextSetOne } from './suggestion'
import type { SetResult } from './types'

const base = { repRange: { min: 8, max: 12 }, goal: 'maintain' as const, mechanic: 'compound' as const, isDeload: false }
const sets = (...s: SetResult[]) => s

describe('suggestNextSetOne', () => {
  it('returns null when there is no history', () => {
    expect(suggestNextSetOne({ ...base, lastSession: null })).toBeNull()
    expect(suggestNextSetOne({ ...base, lastSession: [] })).toBeNull()
  })

  it('adds weight when top set hit the range top with enough RIR (compound +2.5, reset to min)', () => {
    const r = suggestNextSetOne({ ...base, lastSession: sets({ weight: 60, reps: 12, rir: 2 }) })
    expect(r).toEqual({ weight: 62.5, repTarget: 8, reason: 'add_weight' })
  })

  it('uses isolation increment (+1.25)', () => {
    const r = suggestNextSetOne({ ...base, mechanic: 'isolation', lastSession: sets({ weight: 10, reps: 12, rir: 2 }) })
    expect(r).toEqual({ weight: 11.25, repTarget: 8, reason: 'add_weight' })
  })

  it('honors goal-gated RIR: cut needs RIR>=3, so RIR 2 holds at the top', () => {
    const r = suggestNextSetOne({ ...base, goal: 'cut', lastSession: sets({ weight: 60, reps: 12, rir: 2 }) })
    expect(r).toEqual({ weight: 60, repTarget: 12, reason: 'hold_no_reserve' })
  })

  it('bulk progresses with just RIR 1 at the top', () => {
    const r = suggestNextSetOne({ ...base, goal: 'bulk', lastSession: sets({ weight: 60, reps: 12, rir: 1 }) })
    expect(r).toEqual({ weight: 62.5, repTarget: 8, reason: 'add_weight' })
  })

  it('holds weight at top-of-range when RIR is not logged', () => {
    const r = suggestNextSetOne({ ...base, lastSession: sets({ weight: 60, reps: 12, rir: null }) })
    expect(r).toEqual({ weight: 60, repTarget: 12, reason: 'hold_missing_rir' })
  })

  it('adds a rep (toward max) when inside the range', () => {
    const r = suggestNextSetOne({ ...base, lastSession: sets({ weight: 60, reps: 9, rir: 2 }) })
    expect(r).toEqual({ weight: 60, repTarget: 10, reason: 'add_rep' })
  })

  it('rebuilds to the bottom of the range when below min', () => {
    const r = suggestNextSetOne({ ...base, lastSession: sets({ weight: 60, reps: 6, rir: 0 }) })
    expect(r).toEqual({ weight: 60, repTarget: 8, reason: 'rebuild' })
  })

  it('deload: ~10% lighter (rounded to 0.5) at the bottom of the range', () => {
    const r = suggestNextSetOne({ ...base, isDeload: true, lastSession: sets({ weight: 62.5, reps: 12, rir: 2 }) })
    expect(r).toEqual({ weight: 56.5, repTarget: 8, reason: 'deload' })
  })

  it('uses the heaviest set as the top set', () => {
    const r = suggestNextSetOne({ ...base, goal: 'bulk', lastSession: sets(
      { weight: 50, reps: 12, rir: 3 },
      { weight: 60, reps: 12, rir: 1 },
    ) })
    expect(r).toEqual({ weight: 62.5, repTarget: 8, reason: 'add_weight' })
  })

  it('respects an explicit increment override', () => {
    const r = suggestNextSetOne({ ...base, increment: 5, lastSession: sets({ weight: 60, reps: 12, rir: 2 }) })
    expect(r).toEqual({ weight: 65, repTarget: 8, reason: 'add_weight' })
  })
})
