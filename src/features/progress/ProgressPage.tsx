import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { listTrainedExercises, type TrainedExercise } from '../../data/progressRepo'
import { shortDate } from '../history/historyFormat'

export function ProgressPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [items, setItems] = useState<TrainedExercise[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    listTrainedExercises(userId).then(setItems).catch(() => { setError(true); setItems([]) })
  }, [userId])

  const filtered = useMemo(
    () => (items ?? []).filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase())),
    [items, query],
  )
  const control = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white'

  if (items === null) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-4xl space-y-4">
        {error ? (
          <p className="text-sm text-red-500">{t('common.error')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('progress.empty')}</p>
        ) : (
          <>
            <input className={control} placeholder={t('progress.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((i) => (
                <li key={i.exerciseId}>
                  <button onClick={() => navigate(`/progress/${i.exerciseId}`)} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-left dark:bg-[#1b2030]">
                    <div className="font-semibold">{i.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{t('progress.latest')}: {shortDate(i.lastTrained)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
