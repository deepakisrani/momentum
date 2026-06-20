import type { Sex, Goal, Units } from '../domain/types'

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
