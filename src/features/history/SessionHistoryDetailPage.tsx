import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { cacheCompletedSession, getCachedCompletedSession, getSessionFull, type SessionFull } from '../../data/sessionRepo'
import { getCachedExercisesByIds, getExercisesByIds } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import { SessionDetailView } from './SessionDetailView'

export function SessionHistoryDetailPage() {
  const t = useT()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const { sessionId } = useParams<{ sessionId: string }>()
  const [full, setFull] = useState<SessionFull | null>(null)
  const [exById, setExById] = useState<Record<string, ExerciseRow>>({})
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!sessionId || !userId) return
    let ignore = false
    let freshApplied = false
    let cacheShown = false
    void getCachedCompletedSession(userId, sessionId).then(async (cached) => {
      if (!cached) return
      const exercises = await getCachedExercisesByIds(userId, cached.exercises.map((exercise) => exercise.exercise_id))
      if (!ignore && !freshApplied) { cacheShown = true; setError(false); setFull(cached); setExById(exercises) }
    })
    ;(async () => {
      const detail = await getSessionFull(sessionId)
      const exercises = await getExercisesByIds(detail.exercises.map((exercise) => exercise.exercise_id))
      cacheCompletedSession(userId, detail)
      if (!ignore) { freshApplied = true; setFull(detail); setExById(exercises) }
    })().catch(() => { if (!ignore && !cacheShown) setError(true) })
    return () => { ignore = true }
  }, [sessionId, userId])

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
