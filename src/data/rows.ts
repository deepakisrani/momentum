import type { Sex, Goal, Units, Mechanic } from '../domain/types'

export interface ProfileRow {
  id: string
  display_name: string | null
  sex: Sex | null
  date_of_birth: string | null // ISO date 'YYYY-MM-DD'
  height_cm: number | null
  units_pref: Units
  baseline_activity_level: number
  created_at: string
}

export interface WeightLogRow {
  id: string
  user_id: string
  logged_on: string // 'YYYY-MM-DD'
  weight_kg: number
}

export interface GoalLogRow {
  id: string
  user_id: string
  effective_from: string // 'YYYY-MM-DD'
  goal: Goal
}

export interface ExerciseRow {
  id: string
  owner_user_id: string | null
  name: string
  muscle_group: string
  equipment: string | null
  mechanic: Mechanic | null
  is_public: boolean
}

export interface MesoRow {
  id: string
  user_id: string
  name: string
  deload_every_n_microcycles: number | null
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface MesoDayRow {
  id: string
  meso_id: string
  label: string
  order_index: number
}

export interface MesoDayExerciseRow {
  id: string
  meso_day_id: string
  exercise_id: string
  order_index: number
  target_sets: number
  rep_min: number
  rep_max: number
}

export interface WorkoutSessionRow {
  id: string
  user_id: string
  meso_id: string | null
  microcycle_id: string | null
  meso_day_id: string | null
  started_at: string
  ended_at: string | null
  is_deload: boolean
  status: 'in_progress' | 'completed' | 'skipped'
}

export interface SessionExerciseRow {
  id: string
  session_id: string
  exercise_id: string
  source: 'planned' | 'swapped' | 'added'
  order_index: number
}

export interface LoggedSetRow {
  id: string
  session_exercise_id: string
  set_index: number
  is_drop_set: boolean
}

export interface SetSegmentRow {
  id: string
  logged_set_id: string
  segment_index: number
  weight: number
  reps: number
  rir: number | null
}
