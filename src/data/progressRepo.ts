import { supabase } from '../lib/supabase'
import { getExercisesByIds } from './exerciseRepo'
import type { SetRow } from '../domain/progressMetrics'

export interface TrainedExercise { exerciseId: string; name: string; lastTrained: string }

/** Exercises appearing in the user's completed sessions, newest-trained first. */
export async function listTrainedExercises(userId: string): Promise<TrainedExercise[]> {
  if (!userId) return []
  const { data, error } = await supabase
    .from('session_exercise')
    .select('exercise_id, workout_session!inner(user_id, status, started_at)')
    .eq('workout_session.user_id', userId)
    .eq('workout_session.status', 'completed')
  if (error) throw error
  type Raw = { exercise_id: string; workout_session: { started_at: string } }
  const latest = new Map<string, string>()
  for (const r of (data ?? []) as unknown as Raw[]) {
    const d = r.workout_session?.started_at
    if (!d) continue
    const cur = latest.get(r.exercise_id)
    if (!cur || d > cur) latest.set(r.exercise_id, d)
  }
  const ids = [...latest.keys()]
  if (!ids.length) return []
  const byId = await getExercisesByIds(ids)
  return ids
    .map((id) => ({ exerciseId: id, name: byId[id]?.name ?? '—', lastTrained: latest.get(id)! }))
    .sort((a, b) => b.lastTrained.localeCompare(a.lastTrained))
}

/** Flat set rows for one exercise from completed, NON-deload sessions; optional meso filter. */
export async function getExerciseSetRows(
  userId: string,
  exerciseId: string,
  opts?: { mesoId?: string },
): Promise<SetRow[]> {
  let q = supabase
    .from('set_segment')
    .select('weight, reps, logged_set!inner(session_exercise!inner(exercise_id, workout_session!inner(id, user_id, status, is_deload, meso_id, started_at)))')
    .eq('logged_set.session_exercise.exercise_id', exerciseId)
    .eq('logged_set.session_exercise.workout_session.user_id', userId)
    .eq('logged_set.session_exercise.workout_session.status', 'completed')
    .eq('logged_set.session_exercise.workout_session.is_deload', false)
  if (opts?.mesoId) q = q.eq('logged_set.session_exercise.workout_session.meso_id', opts.mesoId)
  const { data, error } = await q
  if (error) throw error
  type Raw = { weight: number; reps: number; logged_set: { session_exercise: { workout_session: { id: string; started_at: string } } } }
  return ((data ?? []) as unknown as Raw[]).map((r) => {
    const ws = r.logged_set.session_exercise.workout_session
    return { sessionId: ws.id, date: ws.started_at, weight: r.weight, reps: r.reps }
  })
}
