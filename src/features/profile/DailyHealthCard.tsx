import { useEffect, useState } from 'react'
import { getDailyHealthData } from '../../data/healthRepo'
import { dailyHealthByDate } from '../../domain/dailyHealth'
import { localIsoDate } from '../history/historyFormat'
import { useUnits } from './useUnits'

function duration(minutes: number) {
  const rounded = Math.round(minutes)
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m`
}

export function DailyHealthCard({ userId }: { userId: string }) {
  const today = localIsoDate(new Date().toISOString())
  const [day, setDay] = useState(today)
  const [result, setResult] = useState<{
    day: string
    metrics?: ReturnType<ReturnType<typeof dailyHealthByDate>>
  }>()
  const units = useUnits()

  useEffect(() => {
    let active = true
    void getDailyHealthData(userId, day, day).then((data) => {
      if (active) setResult({ day, metrics: dailyHealthByDate(data)(day) })
    }).catch(() => { if (active) setResult({ day }) })
    return () => { active = false }
  }, [day, userId])

  const health = result?.day === day ? result.metrics : undefined
  const metrics = health ? [
    ['Weight', health.weight == null ? null : `${units.toWeight(health.weight).toFixed(1)} ${units.weightLabel}`],
    ['Body fat', health.bodyFat == null ? null : `${health.bodyFat.toFixed(1)}%`],
    ['Lean body mass', health.leanMass == null ? null : `${units.toWeight(health.leanMass).toFixed(1)} ${units.weightLabel}`],
    [health.asleep == null ? 'Sleep session' : 'Time asleep',
      health.sleepDuration == null ? null : duration(health.asleep ?? health.sleepDuration)],
    ['Steps', health.steps == null ? null : health.steps.toLocaleString()],
    ['Average heart rate', health.averageHeartRate == null ? null : `${health.averageHeartRate} bpm`],
  ] : []

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Daily health</h2>
        <input type="date" aria-label="Health date" max={today} value={day}
          onChange={(event) => { if (event.target.value) setDay(event.target.value) }}
          className="rounded-md border border-slate-200 bg-transparent px-2 py-1 text-sm dark:border-slate-700" />
      </div>
      {health ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {metrics.map(([label, value]) => (
            <div key={label}><dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="font-semibold">{value ?? '—'}</dd></div>
          ))}
        </dl>
      ) : <p role="status" className="text-sm">{result?.day === day ? 'Could not load health data.' : 'Loading health data…'}</p>}
    </section>
  )
}
