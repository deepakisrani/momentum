import type { Goal, Mechanic, RepRange, SetResult } from './types'

export type SuggestionReason =
  | 'deload'
  | 'add_weight'
  | 'add_rep'
  | 'hold_no_reserve'
  | 'hold_missing_rir'
  | 'rebuild'

export interface Suggestion {
  weight: number
  repTarget: number
  reason: SuggestionReason
}

export interface SuggestionInput {
  lastSession: SetResult[] | null
  repRange: RepRange
  goal: Goal
  mechanic: Mechanic | null
  isDeload: boolean
  /**
   * Overrides the mechanic-derived default increment.
   * Omit (or `undefined`) to use the default; `0` is honored as-is (no weight increase).
   */
  increment?: number
}

/** Deload working weight is reduced to this fraction. */
const DELOAD_WEIGHT_FACTOR = 0.9
/** Suggested weights round to this step. Metric (kg) only — revisit for imperial in the UI layer. */
const WEIGHT_ROUNDING_STEP_KG = 0.5

const RIR_GATE: Record<Goal, number> = { bulk: 1, maintain: 2, cut: 3 }

function defaultIncrement(mechanic: Mechanic | null): number {
  return mechanic === 'isolation' ? 1.25 : 2.5
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function topSet(sets: SetResult[]): SetResult {
  // Tie-break by reps: at equal weight, the set with more reps is the progression anchor.
  return sets.reduce((best, s) =>
    s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best,
  )
}

export function suggestNextSetOne(input: SuggestionInput): Suggestion | null {
  const { lastSession, repRange, goal, mechanic, isDeload } = input
  if (!lastSession || lastSession.length === 0) return null

  const increment = input.increment ?? defaultIncrement(mechanic)
  const top = topSet(lastSession)

  if (isDeload) {
    return { weight: roundTo(top.weight * DELOAD_WEIGHT_FACTOR, WEIGHT_ROUNDING_STEP_KG), repTarget: repRange.min, reason: 'deload' }
  }

  const hitTop = top.reps >= repRange.max

  if (hitTop) {
    if (top.rir == null) {
      return { weight: top.weight, repTarget: repRange.max, reason: 'hold_missing_rir' }
    }
    if (top.rir >= RIR_GATE[goal]) {
      const next = increment > 0 ? roundTo(top.weight + increment, increment) : top.weight + increment
      return { weight: next, repTarget: repRange.min, reason: 'add_weight' }
    }
    return { weight: top.weight, repTarget: repRange.max, reason: 'hold_no_reserve' }
  }

  if (top.reps < repRange.min) {
    return { weight: top.weight, repTarget: repRange.min, reason: 'rebuild' }
  }

  return { weight: top.weight, repTarget: Math.min(top.reps + 1, repRange.max), reason: 'add_rep' }
}
