import { getAnalyticsSessions } from './exportRepo'
import { getDailyHealthData } from './healthRepo'
import { listNotes } from './noteRepo'
import { dailyHealthByDate } from '../domain/dailyHealth'
import { ANALYTICS_VERSION, calendarDate, precedingWorkoutContext, recoveryMetrics, trainingMetrics } from '../domain/trainingAnalytics'

export async function getTrainingAnalytics(
  userId: string, through: string, timeZone: string, sleepTargetMinutes: number,
  { windows = [3, 7, 14, 28], reducedVolumeRatio = 0.7 }:
    { windows?: number[]; reducedVolumeRatio?: number } = {},
) {
  if (!windows.length || new Set(windows).size !== windows.length || windows.some((days) => !Number.isSafeInteger(days) || days < 1)) {
    throw new Error('Analytics windows must be distinct positive whole days')
  }
  if (!Number.isFinite(reducedVolumeRatio) || reducedVolumeRatio <= 0 || reducedVolumeRatio >= 1) {
    throw new Error('Reduced-volume ratio must be between zero and one')
  }
  const historyDays = Math.max(...windows) * 2
  const from = calendarDate(through, 1 - historyDays)
  const until = calendarDate(through, 1)
  const dayFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const [sessions, health, notes] = await Promise.all([
    getAnalyticsSessions(userId, `${calendarDate(from, -1)}T00:00:00Z`, `${calendarDate(until, 1)}T00:00:00Z`),
    getDailyHealthData(userId, calendarDate(from, -3), through),
    listNotes(userId),
  ])
  const workouts = sessions.flatMap((session) => {
    const day = dayFormatter.format(new Date(session.started_at))
    if (!session.id || day < from || day > through) return []
    return [{
      id: session.id, day, startedAt: session.started_at, mesoId: session.meso_id ?? null,
      microcycleId: session.microcycle_id ?? null, deload: session.is_deload,
      exercises: session.session_exercise.flatMap((entry) => entry.exercise_id ? [{
        id: entry.exercise_id, name: entry.exercise?.name ?? '', muscle: entry.exercise?.muscle_group ?? null,
        sets: entry.logged_set.map((set) => ({
          order: set.set_index,
          segments: [...set.set_segment].sort((a, b) => a.segment_index - b.segment_index)
            .map(({ weight, reps, rir }) => ({ loadKg: weight, reps, rir })),
        })),
      }] : []),
    }]
  })
  const healthOn = dailyHealthByDate(health)
  const days = Array.from({ length: historyDays }, (_, index) => {
    const day = calendarDate(from, index)
    const row = healthOn(day)
    return { day, sleepMinutes: row.asleep ?? undefined, weightKg: row.weight, steps: row.steps, restingHeartRate: row.restingHeartRate }
  })
  const exerciseIds = new Set(workouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.id)))
  const sessionIds = new Set(workouts.map((workout) => workout.id))
  const exerciseNotes = notes.filter((note) => {
    if (!note.exerciseIds.some((id) => exerciseIds.has(id))) return false
    if (note.session_id) return sessionIds.has(note.session_id)
    const day = dayFormatter.format(new Date(note.created_at))
    return day >= from && day <= through
  }).map(({ id, body, session_id, exerciseIds, created_at }) => ({
    id, body, exerciseIds, sessionId: session_id, createdAt: created_at,
  }))
  return {
    version: ANALYTICS_VERSION, timeZone, range: { from, through },
    settings: { windows, sleepTargetMinutes, reducedVolumeRatio },
    training: trainingMetrics(workouts, { from, through, reducedVolumeRatio }),
    recovery: recoveryMetrics(days, through, { windows, sleepTargetMinutes }),
    workoutContext: workouts.map((workout) => {
      const cutoff = Date.parse(workout.startedAt)
      const sleepOn = dailyHealthByDate({
        weights: [], body: [], daily: [],
        sleep: health.sleep.filter((record) => Date.parse(record.ended_at) < cutoff),
      })
      const priorDays = [-3, -2, -1].map((offset) => {
        const day = calendarDate(workout.day, offset)
        return { day, sleepMinutes: sleepOn(day).asleep ?? undefined }
      })
      return precedingWorkoutContext(workout, priorDays)
    }),
    exerciseNotes,
  }
}
