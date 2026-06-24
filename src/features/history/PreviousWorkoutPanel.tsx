import { useEffect, useState } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { listMesoSessions, getSessionFull, type SessionSummary, type SessionFull } from '../../data/sessionRepo'
import { getExercisesByIds } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import { SessionDetailView } from './SessionDetailView'
import { shortDate, relativeDate, type RelativeDate } from './historyFormat'

function renderRelative(r: RelativeDate, t: (k: string) => string): string {
  switch (r.kind) {
    case 'today': return t('history.today')
    case 'yesterday': return t('history.yesterday')
    case 'daysAgo': return `${r.n} ${t('history.daysAgo')}`
    case 'weeksAgo': return `${r.n} ${r.n === 1 ? t('history.weekAgo') : t('history.weeksAgo')}`
  }
}

export function PreviousWorkoutPanel({ userId, mesoId, mesoDayId, dayLabel, onClose }: {
  userId: string
  mesoId: string
  mesoDayId: string
  dayLabel: string
  onClose: () => void
}) {
  const t = useT()
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [index, setIndex] = useState(0)
  const [full, setFull] = useState<SessionFull | null>(null)
  const [exById, setExById] = useState<Record<string, ExerciseRow>>({})
  const [detailError, setDetailError] = useState(false)

  useEffect(() => {
    listMesoSessions(userId, mesoId, { mesoDayId }).then(setSessions).catch(() => setSessions([]))
  }, [userId, mesoId, mesoDayId])

  useEffect(() => {
    if (!sessions || !sessions.length) { setFull(null); return }
    let ignore = false
    const s = sessions[index]
    setFull(null); setDetailError(false)
    getSessionFull(s.id).then(async (f) => {
      const ex = await getExercisesByIds(f.exercises.map((e) => e.exercise_id))
      if (!ignore) { setFull(f); setExById(ex) }
    }).catch(() => { if (!ignore) setDetailError(true) })
    return () => { ignore = true }
  }, [sessions, index])

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
