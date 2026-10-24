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
  /** Deload working weight as a fraction of last top set (e.g. 0.6). Defaults to DELOAD_WEIGHT_FACTOR. */
  deloadFactor?: number
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

/** The usual working weight from the previous session, then its best-rep set.
 *
 * A heavier one-off set (a test, accidental plate change, or informal top set) should not
 * silently replace two or three normal working sets as the next session's default. When every
 * weight appears equally often there is no evidence of a working weight, so favour the heavier
 * one and retain the old top-set behaviour for that ambiguous case. */
function workingSet(sets: SetResult[]): SetResult {
  const counts = new Map<number, number>()
  for (const set of sets) counts.set(set.weight, (counts.get(set.weight) ?? 0) + 1)
  let workingWeight = sets[0].weight
  for (const [weight, count] of counts) {
    const currentCount = counts.get(workingWeight) ?? 0
    if (count > currentCount || (count === currentCount && weight > workingWeight)) workingWeight = weight
  }
  return topSet(sets.filter((set) => set.weight === workingWeight))
}

export function suggestNextSetOne(input: SuggestionInput): Suggestion | null {
  const { lastSession, repRange, goal, mechanic, isDeload } = input
  if (!lastSession || lastSession.length === 0) return null

  const increment = input.increment ?? defaultIncrement(mechanic)
  const top = topSet(lastSession)

  if (isDeload) {
    const factor = input.deloadFactor ?? DELOAD_WEIGHT_FACTOR
    return { weight: roundTo(top.weight * factor, WEIGHT_ROUNDING_STEP_KG), repTarget: repRange.min, reason: 'deload' }
  }

  // Progress normal training from the repeated working weight, not an isolated heavier set.
  const working = workingSet(lastSession)

  const hitTop = working.reps >= repRange.max

  if (hitTop) {
    if (working.rir == null) {
      return { weight: working.weight, repTarget: repRange.max, reason: 'hold_missing_rir' }
    }
    if (working.rir >= RIR_GATE[goal]) {
      const next = increment > 0 ? roundTo(working.weight + increment, increment) : working.weight + increment
      return { weight: next, repTarget: repRange.min, reason: 'add_weight' }
    }
    return { weight: working.weight, repTarget: repRange.max, reason: 'hold_no_reserve' }
  }

  if (working.reps < repRange.min) {
    return { weight: working.weight, repTarget: repRange.min, reason: 'rebuild' }
  }

  return { weight: working.weight, repTarget: Math.min(working.reps + 1, repRange.max), reason: 'add_rep' }
}
