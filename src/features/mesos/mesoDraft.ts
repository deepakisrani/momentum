import type { MesoRow, MesoDayRow, MesoDayExerciseRow } from '../../data/rows'

export interface DraftExercise {
  id?: string
  exerciseId: string
  targetSets: number
  repMin: number
  repMax: number
}

export interface DraftDay {
  id?: string
  label: string
  exercises: DraftExercise[]
}

export interface MesoDraft {
  id?: string
  name: string
  deloadEveryN: number | null
  days: DraftDay[]
}

export interface MesoFull {
  meso: MesoRow
  days: (MesoDayRow & { exercises: MesoDayExerciseRow[] })[]
}

export function blankMeso(): MesoDraft {
  return { name: '', deloadEveryN: 5, days: [] }
}

export function draftFromFull(full: MesoFull): MesoDraft {
  return {
    id: full.meso.id,
    name: full.meso.name,
    deloadEveryN: full.meso.deload_every_n_microcycles,
    days: full.days.map((d) => ({
      id: d.id,
      label: d.label,
      exercises: d.exercises.map((e) => ({
        id: e.id, exerciseId: e.exercise_id, targetSets: e.target_sets, repMin: e.rep_min, repMax: e.rep_max,
      })),
    })),
  }
}

/** Drops all ids so a save creates a brand-new meso (used for "duplicate"). */
export function stripIds(draft: MesoDraft): MesoDraft {
  return {
    name: draft.name,
    deloadEveryN: draft.deloadEveryN,
    days: draft.days.map((d) => ({
      label: d.label,
      exercises: d.exercises.map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, repMin: e.repMin, repMax: e.repMax })),
    })),
  }
}

/** Returns a list of error codes (empty = valid). The UI maps codes to copy. */
export function validateMeso(draft: MesoDraft): string[] {
  const errors: string[] = []
  if (!draft.name.trim()) errors.push('name')
  if (draft.days.length === 0) errors.push('days')
  draft.days.forEach((d, i) => {
    if (!d.label.trim()) errors.push(`day.${i}.label`)
    d.exercises.forEach((e, j) => {
      if (e.repMin > e.repMax) errors.push(`day.${i}.ex.${j}.range`)
      if (e.targetSets < 1) errors.push(`day.${i}.ex.${j}.sets`)
    })
  })
  return errors
}

export function moveItem<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir
  if (j < 0 || j >= arr.length) return arr
  const copy = arr.slice()
  ;[copy[index], copy[j]] = [copy[j], copy[index]]
  return copy
}
