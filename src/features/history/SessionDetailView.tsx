import { useT } from '../../i18n/I18nProvider'
import { useUnits } from '../profile/useUnits'
import { shortDate, formatDuration } from './historyFormat'
import type { SessionFull } from '../../data/sessionRepo'
import type { ExerciseRow } from '../../data/rows'

/** Read-only render of one full session. Pure presentational — no fetching. */
export function SessionDetailView({ full, exercisesById }: {
  full: SessionFull
  exercisesById: Record<string, ExerciseRow>
}) {
  const t = useT()
  const u = useUnits()
  const { session, exercises } = full
  const duration = formatDuration(session.started_at, session.ended_at)
  // Only show exercises that were actually performed — skip ones with no logged sets.
  const logged = exercises.filter((se) => se.sets.length > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span>{shortDate(session.started_at)}</span>
        {duration && <span>· {duration}</span>}
        {session.is_deload && (
          <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{t('history.deload')}</span>
        )}
      </div>
      {logged.map((se) => {
        const ex = exercisesById[se.exercise_id]
        return (
          <div key={se.id}>
            <div className="font-semibold">{ex?.name ?? '—'}</div>
            <ul className="mt-1 space-y-0.5 text-sm">
              {se.sets.map((s, i) => {
                const seg = s.segments[0]
                if (!seg) return null
                return (
                  <li key={s.id} className="flex gap-3 tabular-nums">
                    <span className="w-4 text-slate-400">{i + 1}</span>
                    <span>{u.toWeight(seg.weight)} {u.weightLabel} × {seg.reps}</span>
                    {seg.rir != null && <span className="text-slate-400">{t('workout.rir')} {seg.rir}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
