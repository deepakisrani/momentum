import { supabase } from '../lib/supabase'

// Shape of the nested select response (only the fields we request).
export interface QSegment { segment_index: number; weight: number; reps: number; rir: number | null }
export interface QSet { set_index: number; set_segment: QSegment[] }
export interface QExercise { order_index: number; exercise: { name: string; muscle_group: string } | null; logged_set: QSet[] }
export interface QSession {
  started_at: string
  is_deload: boolean
  meso_day_id: string | null
  meso_day: { label: string } | null
  session_exercise: QExercise[]
}

export interface MesoSetRow {
  date: string
  dayLabel: string | null
  isDeload: boolean
  exercise: string
  muscleGroup: string | null
  setNumber: number
  weightKg: number
  reps: number
  rir: number | null
}

/** Flatten the nested meso query into sorted, one-row-per-segment records.
 * Sort: date asc, then exercise order_index, then set_index, then segment_index.
 * setNumber is a 1-based ordinal within each (session, exercise). */
export function flattenMesoQuery(sessions: QSession[]): MesoSetRow[] {
  const rows: MesoSetRow[] = []
  const byDate = [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at))
  for (const s of byDate) {
    const exercises = [...(s.session_exercise ?? [])].sort((a, b) => a.order_index - b.order_index)
    for (const se of exercises) {
      const sets = [...(se.logged_set ?? [])].sort((a, b) => a.set_index - b.set_index)
      let setNumber = 0
      for (const ls of sets) {
        setNumber += 1
        const segs = [...(ls.set_segment ?? [])].sort((a, b) => a.segment_index - b.segment_index)
        for (const seg of segs) {
          rows.push({
            date: s.started_at,
            dayLabel: s.meso_day?.label ?? null,
            isDeload: s.is_deload,
            exercise: se.exercise?.name ?? '',
            muscleGroup: se.exercise?.muscle_group ?? null,
            setNumber,
            weightKg: seg.weight,
            reps: seg.reps,
            rir: seg.rir,
          })
        }
      }
    }
  }
  return rows
}

/** Fetch all completed logged sets for one meso in a single nested query. */
export async function getMesoSetRows(userId: string, mesoId: string): Promise<MesoSetRow[]> {
  const { data, error } = await supabase
    .from('workout_session')
    .select(
      'started_at, is_deload, meso_day_id, meso_day ( label ), session_exercise ( order_index, exercise ( name, muscle_group ), logged_set ( set_index, set_segment ( segment_index, weight, reps, rir ) ) )',
    )
    .eq('user_id', userId)
    .eq('meso_id', mesoId)
    .eq('status', 'completed')
    .order('started_at', { ascending: true })
  if (error) throw error
  return flattenMesoQuery((data ?? []) as unknown as QSession[])
}
