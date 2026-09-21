import { useEffect, useState } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { listMesoSessions, getCachedCompletedSession, cacheCompletedSession, getSessionFull, type SessionSummary, type SessionFull } from '../../data/sessionRepo'
import { getCachedExercisesByIds, getExercisesByIds } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import { SessionDetailView } from './SessionDetailView'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { shortDate, relativeDate, type RelativeDate } from './historyFormat'

function renderRelative(r: RelativeDate, t: (k: string) => string): string {
  switch (r.kind) {
    case 'today': return t('history.today')
    case 'yesterday': return t('history.yesterday')
    case 'daysAgo': return `${r.n} ${t('history.daysAgo')}`
    case 'weeksAgo': return `${r.n} ${r.n === 1 ? t('history.weekAgo') : t('history.weeksAgo')}`
  }
}

export function PreviousWorkoutPanel({ userId, mesoId, mesoDayId, dayLabel, since, onClose }: {
  userId: string
  mesoId: string
  mesoDayId: string
  dayLabel: string
  /** `activated_at` **of `mesoId`**, or null for no window. Only the current run is
   * "previous" -- a session from before the meso was re-activated belongs to an earlier
   * block, and History is where those live. It must be that meso's own timestamp: windowing
   * one meso's sessions by another's silently empties the panel, since the catch below turns
   * any failure, and a filter that matches nothing, into the same "no previous workout". */
  since: string | null
  onClose: () => void
}) {
  const t = useT()
  useBodyScrollLock()
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [index, setIndex] = useState(0)
  const [full, setFull] = useState<SessionFull | null>(null)
  const [exById, setExById] = useState<Record<string, ExerciseRow>>({})
  const [detailError, setDetailError] = useState(false)

  useEffect(() => {
    listMesoSessions(userId, mesoId, { mesoDayId, since })
      .then(setSessions)
      .catch((err) => {
        // An empty panel and a failed query look identical here, and `since` is a new column:
        // without this line, a bad window is indistinguishable from "no previous workout".
        if (import.meta.env.DEV) console.error('[History] previous workout failed:', err)
        setSessions([])
      })
  }, [userId, mesoId, mesoDayId, since])

  useEffect(() => {
    if (!sessions || !sessions.length) { setFull(null); return }
    let ignore = false
    let freshApplied = false
    let cacheShown = false
    const s = sessions[index]
    setFull(null); setDetailError(false)
    // Completed session snapshots are immutable. Render the on-device copy first, then replace
    // it with Supabase's response so a cache miss/stale entry never becomes the source of truth.
    void getCachedCompletedSession(userId, s.id).then(async (cached) => {
      if (!cached) return
      const exercises = await getCachedExercisesByIds(userId, cached.exercises.map((exercise) => exercise.exercise_id))
      if (!ignore && !freshApplied) { cacheShown = true; setDetailError(false); setFull(cached); setExById(exercises) }
    })
    getSessionFull(s.id).then(async (full) => {
      const exercises = await getExercisesByIds(full.exercises.map((exercise) => exercise.exercise_id))
      cacheCompletedSession(userId, full)
      if (!ignore) { freshApplied = true; setFull(full); setExById(exercises) }
    }).catch(() => { if (!ignore && !cacheShown) setDetailError(true) })
    return () => { ignore = true }
  }, [sessions, index, userId])

  const current = sessions?.[index]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div className="mt-auto max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white sm:mx-auto sm:max-w-2xl sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('history.previousTitle')}</h2>
          <button onClick={onClose} className="text-sm text-slate-500 dark:text-slate-400">{t('exercises.cancel')}</button>
        </div>
        {sessions === null ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.noPreviousDay')}</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <button aria-label={t('history.older')} disabled={index >= sessions.length - 1} onClick={() => setIndex((i) => i + 1)} className="text-sm font-semibold text-brand-700 disabled:opacity-30 dark:text-brand-400">← {t('history.older')}</button>
              <div className="text-center text-xs text-slate-500 dark:text-slate-400">
                <div>{dayLabel} · {current && shortDate(current.started_at)}</div>
                <div>{current && renderRelative(relativeDate(current.started_at, new Date()), t)}</div>
              </div>
              <button aria-label={t('history.newer')} disabled={index <= 0} onClick={() => setIndex((i) => i - 1)} className="text-sm font-semibold text-brand-700 disabled:opacity-30 dark:text-brand-400">{t('history.newer')} →</button>
            </div>
            {detailError ? <p className="text-sm text-red-500">{t('common.error')}</p> : full ? <SessionDetailView full={full} exercisesById={exById} /> : <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>}
          </>
        )}
      </div>
    </div>
  )
}
