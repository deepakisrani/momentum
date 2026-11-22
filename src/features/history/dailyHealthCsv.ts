import type { getDailyHealthData } from '../../data/healthRepo'
import { toCsv } from '../../domain/csv'
import type { getMesoExport } from '../../data/exportRepo'
import { localIsoDate } from './historyFormat'
import { calendarDay, dailyHealthByDate, type DayRange } from '../../domain/dailyHealth'

export function dailyHealthCsv(
  ranges: DayRange[],
  data: Awaited<ReturnType<typeof getDailyHealthData>>,
  training: Awaited<ReturnType<typeof getMesoExport>>,
  weightUnit: string,
  toWeight: (kg: number) => number,
) {
  const healthOn = dailyHealthByDate(data)
  const sessionsByDay = new Map<string, typeof training.sessions>()
  const setsBySession = new Map<string, typeof training.rows>()
  for (const row of training.rows) {
    const key = row.sessionId ?? row.date
    const sets = setsBySession.get(key) ?? []
    sets.push(row)
    setsBySession.set(key, sets)
  }
  for (const session of training.sessions) {
    const day = localIsoDate(session.started_at)
    const sessions = sessionsByDay.get(day) ?? []
    sessions.push(session)
    sessionsByDay.set(day, sessions)
  }
  const days = new Set<string>()
  for (const range of ranges) {
    for (let day = range.firstDay; day <= range.lastDay; day = calendarDay(day, 1)) days.add(day)
  }
  return toCsv([
    'date', 'weight_kg', 'body_fat_pct', 'lean_mass_kg', 'sleep_session_minutes',
    'time_asleep_minutes', 'steps', 'resting_heart_rate_bpm', 'workouts_completed', 'workouts',
  ], [...days].sort().map((day) => {
    const health = healthOn(day)
    const workouts = (sessionsByDay.get(day) ?? []).map((session) => ({
      started_at: session.started_at,
      day: session.meso_day?.label ?? null,
      deload: session.is_deload,
      sets: (setsBySession.get(session.id ?? session.started_at) ?? []).map((set) => ({
        exercise: set.exercise,
        muscle_group: set.muscleGroup,
        set: set.setNumber,
        weight: toWeight(set.weightKg),
        weight_unit: weightUnit,
        reps: set.reps,
        rir: set.rir,
      })),
    }))
    return [
      day, health.weight ?? '', health.bodyFat ?? '', health.leanMass ?? '',
      health.sleepDuration?.toFixed(2) ?? '', health.asleep?.toFixed(2) ?? '',
      health.steps ?? '', health.restingHeartRate ?? '', workouts.length,
      workouts.length ? JSON.stringify(workouts) : '',
    ]
  }))
}
