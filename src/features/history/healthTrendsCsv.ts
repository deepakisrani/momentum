import type { getHealthTrendsData, SleepSession } from '../../data/healthRepo'
import { toCsv } from '../../domain/csv'
import { localIsoDate } from './historyFormat'

const DAY = 86_400_000
const MINUTE = 60_000
const ASLEEP = new Set([2, 4, 5, 6])
type Interval = { start: number; end: number }

export interface TrainingRun {
  workouts: string[]
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

function average(values: number[]): string {
  return values.length ? (values.reduce((total, value) => total + value, 0) / values.length).toFixed(2) : ''
}

export function healthTrendsCsv(runs: TrainingRun[], data: Awaited<ReturnType<typeof getHealthTrendsData>>) {
  const headers = [
    'run', 'week', 'start_date', 'end_date', 'workouts_completed',
    'mean_weight_kg', 'weigh_in_days', 'mean_body_fat_pct', 'body_fat_days',
    'mean_lean_mass_kg', 'lean_mass_days', 'mean_sleep_session_minutes', 'sleep_days',
    'mean_time_asleep_minutes', 'days_with_complete_sleep_stages',
  ]
  const bodyByDay = new Map<string, typeof data.body[number]>()
  for (const row of data.body) {
    const key = `${row.metric}:${sourceDay(row.measured_at, row.zone_offset_seconds)}`
    const current = bodyByDay.get(key)
    if (!current || Date.parse(row.measured_at) > Date.parse(current.measured_at)) bodyByDay.set(key, row)
  }
  const sleepByDay = new Map<string, SleepSession[]>()
  for (const row of data.sleep) {
    const day = sourceDay(row.ended_at, row.end_offset_seconds)
    const sessions = sleepByDay.get(day) ?? []
    sessions.push(row)
    sleepByDay.set(day, sessions)
  }
  const weightsByDay = new Map(data.weights.map((row) => [row.logged_on, row.weight_kg]))
  const rows: (string | number)[][] = []
  for (const [index, run] of runs.entries()) {
    const workouts = run.workouts.map(localIsoDate)
    const last = Date.parse(run.lastDay)
    for (let start = Date.parse(run.firstDay), week = 1; start <= last; start += 7 * DAY, week++) {
      const end = Math.min(start + 6 * DAY, last)
      const weights: number[] = []
      const bodyFat: number[] = []
      const leanMass: number[] = []
      const sleep: number[] = []
      const asleep: number[] = []
      let trainingCount = 0
      for (let cursor = start; cursor <= end; cursor += DAY) {
        const day = new Date(cursor).toISOString().slice(0, 10)
        trainingCount += workouts.filter((date) => date === day).length
        const weight = weightsByDay.get(day)
        const fat = bodyByDay.get(`body_fat_pct:${day}`)
        const lean = bodyByDay.get(`lean_mass_kg:${day}`)
        if (weight != null) weights.push(weight)
        if (fat) bodyFat.push(fat.value)
        if (lean) leanMass.push(lean.value)
        const dailySleep = summarizeSleep(sleepByDay.get(day) ?? [])
        if (dailySleep) sleep.push(dailySleep.duration)
        if (dailySleep?.asleep != null) asleep.push(dailySleep.asleep)
      }
      rows.push([
        index + 1, week, new Date(start).toISOString().slice(0, 10), new Date(end).toISOString().slice(0, 10),
        trainingCount, average(weights), weights.length, average(bodyFat), bodyFat.length,
        average(leanMass), leanMass.length, average(sleep), sleep.length, average(asleep), asleep.length,
      ])
    }
  }
  return toCsv(headers, rows)
}
