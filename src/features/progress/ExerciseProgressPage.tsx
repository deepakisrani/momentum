import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useUnits } from '../profile/useUnits'
import { getActiveMeso } from '../../data/mesoRepo'
import { getExercisesByIds } from '../../data/exerciseRepo'
import { getExerciseSetRows } from '../../data/progressRepo'
import { summarizeSessions, type ProgressionPoint } from '../../domain/progressMetrics'
import { LineChart } from '../../components/charts/LineChart'
import { shortDate } from '../history/historyFormat'

type Metric = 'e1rm' | 'volume'
type Range = 'all' | 'meso'

export function ExerciseProgressPage() {
  const t = useT()
  const u = useUnits()
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [name, setName] = useState('')
  const [activeMesoId, setActiveMesoId] = useState<string | null>(null)
  const [points, setPoints] = useState<ProgressionPoint[] | null>(null)
  const [metric, setMetric] = useState<Metric>('e1rm')
  const [range, setRange] = useState<Range>('all')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!exerciseId) return
    let cancelled = false
    setPoints(null)
    ;(async () => {
      const [byId, meso] = await Promise.all([getExercisesByIds([exerciseId]), getActiveMeso(userId)])
      if (cancelled) return
      setName(byId[exerciseId]?.name ?? '—')
      const mesoId = meso?.id ?? null
      setActiveMesoId(mesoId)
      const rows = await getExerciseSetRows(userId, exerciseId, range === 'meso' && mesoId ? { mesoId } : undefined)
      if (cancelled) return
      setPoints(summarizeSessions(rows))
    })().catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [exerciseId, userId, range])

  const chartPoints = useMemo(
    () => (points ?? []).map((p) => ({ t: new Date(p.date).getTime(), v: u.toWeight(metric === 'e1rm' ? p.e1rm : p.volume) })),
    [points, metric, u],
  )
  const latest = chartPoints.length ? chartPoints[chartPoints.length - 1] : null
  const tab = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-[#1b2030]'}`

  if (error) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white"><p className="text-sm text-red-500">{t('common.error')}</p></div>
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-bold">{name}</h1>
        <div className="flex gap-2">
          <button aria-pressed={metric === 'e1rm'} className={tab(metric === 'e1rm')} onClick={() => setMetric('e1rm')}>{t('progress.metric.e1rm')}</button>
          <button aria-pressed={metric === 'volume'} className={tab(metric === 'volume')} onClick={() => setMetric('volume')}>{t('progress.metric.volume')}</button>
        </div>
        {activeMesoId && (
          <div className="flex gap-2">
            <button aria-pressed={range === 'all'} className={tab(range === 'all')} onClick={() => setRange('all')}>{t('progress.range.all')}</button>
            <button aria-pressed={range === 'meso'} className={tab(range === 'meso')} onClick={() => setRange('meso')}>{t('progress.range.meso')}</button>
          </div>
        )}
        {points === null ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
        ) : chartPoints.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('progress.notEnoughData')}</p>
        ) : (
          <>
            <LineChart
              points={chartPoints}
              formatValue={(v) => `${Math.round(v)} ${u.weightLabel}`}
              formatDate={(ms) => shortDate(new Date(ms).toISOString())}
              yLabel={metric === 'e1rm' ? t('progress.metric.e1rm') : t('progress.metric.volume')}
            />
            {latest && <p className="text-sm text-slate-500 dark:text-slate-400">{t('progress.latest')}: {Math.round(latest.v)} {u.weightLabel}</p>}
            {chartPoints.length < 2 && <p className="text-sm text-slate-500 dark:text-slate-400">{t('progress.notEnoughData')}</p>}
          </>
        )}
      </div>
    </div>
  )
}
