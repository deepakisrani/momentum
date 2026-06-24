import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { getActiveMeso, getMesoFull } from '../../data/mesoRepo'
import { listMesoSessions, type SessionSummary } from '../../data/sessionRepo'
import { shortDate } from './historyFormat'

export function HistoryPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [dayLabels, setDayLabels] = useState<Record<string, string>>({})
  const [hasMeso, setHasMeso] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    (async () => {
      const meso = await getActiveMeso(userId)
      if (!meso) { setHasMeso(false); setSessions([]); return }
      const [full, list] = await Promise.all([getMesoFull(meso.id), listMesoSessions(userId, meso.id)])
      setDayLabels(Object.fromEntries(full.days.map((d) => [d.id, d.label])))
      setSessions(list)
    })().catch(() => { setError(true); setSessions([]) })
  }, [userId])

  if (sessions === null) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-4xl space-y-2">
        {error ? (
          <p className="text-sm text-red-500">{t('common.error')}</p>
        ) : !hasMeso ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.noActiveMeso')}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.empty')}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(`/history/${s.id}`)}
              className="flex w-full items-center justify-between rounded-xl bg-slate-100 px-4 py-3 text-left dark:bg-[#1b2030]"
            >
              <div>
                <div className="font-semibold">{s.meso_day_id ? dayLabels[s.meso_day_id] ?? '—' : '—'}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{shortDate(s.started_at)} · {s.exerciseCount} {t('history.exercises')}</div>
              </div>
              {s.is_deload && (
                <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{t('history.deload')}</span>
              )}
            </button>
          ))}
          </div>
        )}
      </div>
    </div>
  )
}
