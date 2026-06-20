import type { SetResult, Goal, Mechanic } from '../../domain/types'
import type { SuggestionInput } from '../../domain/suggestion'

export type ExerciseStatus = 'not_started' | 'in_progress' | 'done'

export function formatLastTime(sets: SetResult[] | null): string | null {
  if (!sets || sets.length === 0) return null
  const allSameWeight = sets.every((s) => s.weight === sets[0].weight)
  if (allSameWeight) {
    return `${sets[0].weight} × (${sets.map((s) => s.reps).join(', ')})`
  }
  return sets.map((s) => `${s.weight}×${s.reps}`).join(' · ')
}

export function exerciseStatus(targetSets: number, completedSets: number): ExerciseStatus {
  if (completedSets <= 0) return 'not_started'
  if (completedSets >= targetSets) return 'done'
  return 'in_progress'
}

export function buildSuggestionInput(args: {
  last: SetResult[] | null
  target: { repMin: number; repMax: number }
  goal: Goal
  mechanic: Mechanic | null
  isDeload: boolean
}): SuggestionInput {
  return {
    lastSession: args.last,
    repRange: { min: args.target.repMin, max: args.target.repMax },
    goal: args.goal,
    mechanic: args.mechanic,
    isDeload: args.isDeload,
  }
}
