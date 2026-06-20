export type Sex = 'male' | 'female'
export type Goal = 'cut' | 'bulk' | 'maintain'
export type Mechanic = 'compound' | 'isolation'
export type Units = 'metric' | 'imperial'
export type SchedulingStyle = 'calendar_week' | 'continuous'

/** Day a calendar week starts on: 0=Sunday .. 6=Saturday. */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface RepRange {
  min: number
  max: number
}

/** One logged set's working result (for a drop-set, this is its top segment). */
export interface SetResult {
  weight: number
  reps: number
  rir: number | null
}
