import type { getDailyHealthData, SleepSession } from '../data/healthRepo'

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
