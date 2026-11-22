import { useEffect, useState } from 'react'
import { getTrainingAnalytics } from '../../data/analyticsRepo'
import { localIsoDate } from '../history/historyFormat'
import { calendarDate } from '../../domain/trainingAnalytics'
import { downloadTextFile } from '../../lib/download'

const units: Record<string, string> = {
  'sleep.mean_minutes': 'min', 'sleep.consistency_sd_minutes': 'min', 'sleep.shortfall_minutes': 'min',
  'weight.mean_kg': 'kg', 'steps.mean_count': 'steps',
  'heart_rate.mean_daily_bpm': 'bpm',
}
const labels: Record<string, string> = {
  'sleep.mean_minutes': 'Average time asleep', 'sleep.consistency_sd_minutes': 'Sleep duration variability',
  'sleep.shortfall_minutes': 'Observed sleep shortfall', 'weight.mean_kg': 'Average weight',
  'steps.mean_count': 'Average steps',
  'heart_rate.mean_daily_bpm': 'Average heart rate',
}

export function TrainingAnalyticsPanel({ userId }: { userId: string }) {
  const latest = calendarDate(localIsoDate(new Date().toISOString()), -1)
  const [through, setThrough] = useState(latest)
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('480')
  const [report, setReport] = useState<Awaited<ReturnType<typeof getTrainingAnalytics>> | null>(null)
  const [error, setError] = useState('')
  const targetMinutes = Number(target)
  const targetValid = Number.isInteger(targetMinutes) && targetMinutes > 0 && targetMinutes <= 1440
  useEffect(() => {
    if (!open || !userId || !targetValid) return
    let active = true
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    void getTrainingAnalytics(userId, through, timeZone, targetMinutes).then((data) => {
      if (active) { setReport(data); setError('') }
    }).catch(() => { if (active) setError('Could not load training analytics.') })
    return () => { active = false }
  }, [open, userId, through, targetMinutes, targetValid])
  const current = targetValid && report?.range.through === through && report.settings.sleepTargetMinutes === targetMinutes ? report : null
  const matched = current?.training.matchedRepObservations.filter((row) => row.previousReps !== null).slice(-8).reverse()
  async function exportReport() {
    if (!current) return
    try {
      await downloadTextFile(`momentum-analytics-${through}.json`, JSON.stringify(current, null, 2), 'application/json')
    } catch {
      setError('Could not export training analytics.')
    }
  }
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <summary className="cursor-pointer font-semibold">Training analytics</summary>
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label>Through <input type="date" max={latest} value={through}
            onChange={(event) => { if (event.target.value) setThrough(event.target.value) }} className="rounded border bg-transparent p-1" /></label>
          <label>Sleep target (minutes) <input type="number" min="1" max="1440" value={target}
            onChange={(event) => setTarget(event.target.value)} className="w-20 rounded border bg-transparent p-1" /></label>
          <button type="button" disabled={!current} onClick={() => void exportReport()}
            className="rounded bg-brand-700 px-3 py-1.5 text-white disabled:opacity-50">Export analytics JSON</button>
        </div>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        {!targetValid && <p role="status" className="text-sm">Enter a sleep target from 1 to 1440 minutes.</p>}
        {targetValid && !current && !error && <p role="status" className="text-sm">Loading training analytics…</p>}
        {current && <>
          <section>
            <h2 className="font-semibold">Weekly training</h2>
            {current.training.sessions.length === 0 && <p className="text-sm">No completed workouts in this date range.</p>}
            <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
              {current.training.weeks.map((week) => <li key={week.week} className="py-2">
                <div><strong>{week.week}</strong> · {week.sessions} sessions · {week.workingSets} logged sets · {week.deloadSessions} deload sessions</div>
                <div>{week.highEffortSets} sets at 0–1 RIR · RIR logged for {week.rirSamples} of {week.workingSets} sets</div>
                {week.coveredDays !== 7 && <div>{week.coveredDays} days of this week included</div>}
                {week.reducedVolume && <div>Reduced volume · prior three-week median {week.baselineWorkingSets} sets</div>}
              </li>)}
            </ul>
          </section>
          <section>
            <h2 className="font-semibold">Recovery</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr><th>Metric</th>{current.settings.windows.map((window) => <th key={window} className="p-2">{window} days</th>)}</tr></thead>
                <tbody>{Object.entries(labels).map(([id, label]) => <tr key={id}>
                  <th scope="row" className="font-normal">{label}</th>
                  {current.recovery.filter((metric) => metric.id === id).map((metric) => <td key={metric.windowDays} className="p-2">
                    {metric.value === null ? '—' : `${metric.value.toFixed(1)} ${units[id]}`}
                    <span className="block text-xs text-slate-500">{metric.sampleSize}/{metric.windowDays} days</span>
                  </td>)}
                </tr>)}</tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className="font-semibold">Matched sets</h2>
            <p className="text-xs text-slate-500">Same exercise, logged load, and RIR in the previous matching session.</p>
            {matched?.length ? <ul className="text-sm">{matched.map((row) =>
              <li key={`${row.sessionId}:${row.exerciseId}:${row.loadKg}:${row.rir}`}>
                {row.day} · {row.name} · {row.loadKg} kg at {row.rir} RIR · {row.previousReps} → {row.reps} reps
              </li>)}</ul> : <p className="text-sm">No matching sessions in this date range.</p>}
          </section>
          {current.exerciseNotes.length > 0 && <section>
            <h2 className="font-semibold">Exercise notes</h2>
            <ul className="space-y-2 text-sm">{current.exerciseNotes.map((note) =>
              <li key={note.id} className="whitespace-pre-wrap">{note.body}</li>)}</ul>
          </section>}
        </>}
      </div>
    </details>
  )
}
