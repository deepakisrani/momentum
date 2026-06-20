import type { ExerciseRow } from '../../data/rows'
import type { Mechanic } from '../../domain/types'

export interface ExerciseFilter {
  query: string
  muscleGroup: string | 'all'
  mechanic: Mechanic | 'all'
}

export function filterExercises(exercises: ExerciseRow[], f: ExerciseFilter): ExerciseRow[] {
  const q = f.query.trim().toLowerCase()
  return exercises.filter((e) => {
    if (q && !e.name.toLowerCase().includes(q)) return false
    if (f.muscleGroup !== 'all' && e.muscle_group !== f.muscleGroup) return false
    if (f.mechanic !== 'all' && e.mechanic !== f.mechanic) return false
    return true
  })
}

export function distinctMuscleGroups(exercises: ExerciseRow[]): string[] {
  return [...new Set(exercises.map((e) => e.muscle_group))].sort()
}

export function distinctEquipment(exercises: ExerciseRow[]): string[] {
  return [...new Set(exercises.map((e) => e.equipment).filter((v): v is string => v != null))].sort()
}
