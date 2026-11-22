import type { getDailyHealthData, SleepSession } from '../../data/healthRepo'
import { toCsv } from '../../domain/csv'
import type { getMesoExport } from '../../data/exportRepo'
import { localIsoDate } from './historyFormat'

const DAY = 86_400_000
const MINUTE = 60_000
const ASLEEP = new Set([2, 4, 5, 6])
type Interval = { start: number; end: number }

export interface DayRange {
  firstDay: string
  lastDay: string
}

function sourceDay(timestamp: string, offset: number | null): string {
  return new Date(Date.parse(timestamp) + (offset ?? 0) * 1000).toISOString().slice(0, 10)
}

function minutes(intervals: Interval[]): number {
  let end = -Infinity
  let total = 0
  for (const interval of intervals.sort((a, b) => a.start - b.start)) {
    total += Math.max(0, interval.end - Math.max(end, interval.start))
    end = Math.max(end, interval.end)
  }
  return total / MINUTE
}

function summarizeSleep(sessions: SleepSession[]) {
  const bySource = new Map<string, SleepSession[]>()
  for (const session of sessions) {
    const source = bySource.get(session.source_package) ?? []
    source.push(session)
    bySource.set(session.source_package, source)
  }
  return [...bySource.entries()].map(([source, records]) => {
    const intervals = records.map((row) => ({ start: Date.parse(row.started_at), end: Date.parse(row.ended_at) }))
    const stages = records.flatMap((row, index) => row.stages.map((stage) => ({
      type: stage.type,
      start: Math.max(intervals[index].start, Date.parse(stage.start)),
      end: Math.min(intervals[index].end, Date.parse(stage.end)),
    })).filter((stage) => stage.end > stage.start))
    const duration = minutes(intervals)
    const staged = minutes(stages.filter((stage) => stage.type >= 1 && stage.type <= 7))
    const asleep = minutes(stages.filter((stage) => ASLEEP.has(stage.type)))
    const awake = minutes(stages.filter((stage) => [1, 3, 7].includes(stage.type)))
    const hasCompleteStages = staged === duration && Math.abs(asleep + awake - staged) < 1e-6
    return { source, duration, asleep: hasCompleteStages ? asleep : null }
  }).sort((a, b) => b.duration - a.duration || a.source.localeCompare(b.source))[0]
}


export function calendarDay(day: string, days: number) {
  return new Date(Date.parse(day) + days * DAY).toISOString().slice(0, 10)
}

export function dailyHealthByDate(data: Awaited<ReturnType<typeof getDailyHealthData>>) {
  const body = new Map<string, typeof data.body[number]>()
  for (const row of data.body) {
    const key = row.metric + ':' + sourceDay(row.measured_at, row.zone_offset_seconds)
    const current = body.get(key)
    if (!current || Date.parse(row.measured_at) > Date.parse(current.measured_at)) body.set(key, row)
  }
  const sleep = new Map<string, SleepSession[]>()
  for (const row of data.sleep) {
    const day = sourceDay(row.ended_at, row.end_offset_seconds)
    const sessions = sleep.get(day) ?? []
    sessions.push(row)
    sleep.set(day, sessions)
  }
  const weights = new Map(data.weights.map((row) => [row.logged_on, row.weight_kg]))
  const daily = new Map(data.daily.map((row) => [row.metric + ':' + row.day, row.value]))
  return (day: string) => {
    const night = summarizeSleep(sleep.get(day) ?? [])
    return {
      weight: weights.get(day),
      bodyFat: body.get('body_fat_pct:' + day)?.value,
      leanMass: body.get('lean_mass_kg:' + day)?.value,
      sleepDuration: night?.duration,
      asleep: night?.asleep,
      steps: daily.get('steps:' + day),
      restingHeartRate: daily.get('resting_heart_rate:' + day),
    }
  }
}

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
