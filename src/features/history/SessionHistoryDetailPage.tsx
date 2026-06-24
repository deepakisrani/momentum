import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useT } from '../../i18n/I18nProvider'
import { getSessionFull, type SessionFull } from '../../data/sessionRepo'
import { getExercisesByIds } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import { SessionDetailView } from './SessionDetailView'

export function SessionHistoryDetailPage() {
  const t = useT()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [full, setFull] = useState<SessionFull | null>(null)
  const [exById, setExById] = useState<Record<string, ExerciseRow>>({})
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    (async () => {
      const f = await getSessionFull(sessionId)
      const ex = await getExercisesByIds(f.exercises.map((e) => e.exercise_id))
      setFull(f); setExById(ex)
    })().catch(() => setError(true))
  }, [sessionId])

  if (error) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white"><p className="text-sm text-red-500">{t('common.error')}</p></div>
  }
  if (!full) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-2xl"><SessionDetailView full={full} exercisesById={exById} /></div>
    </div>
  )
}
