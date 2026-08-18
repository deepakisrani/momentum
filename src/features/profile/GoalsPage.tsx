import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from './useProfileData'
import { useUnits } from './useUnits'
import { buildEnergySummary } from './energySummary'
import { listWeights } from '../../data/weightRepo'
import type { WeightLogRow } from '../../data/rows'
import { LineChart } from '../../components/charts/LineChart'
import { useChartCurve } from '../../prefs/chartPref'
import { shortDate } from '../history/historyFormat'
import { LogWeightModal } from './LogWeightModal'

export function GoalsPage() {
  const t = useT()
  const { session } = useAuth()
  const { profile, latestWeight, latestGoal, reload } = useProfileData()
  const u = useUnits()
  const curve = useChartCurve()
  const [modalOpen, setModalOpen] = useState(false)
  const userId = session?.user.id ?? ''
  const [weights, setWeights] = useState<WeightLogRow[] | null>(null)
  const loadWeights = useCallback(() => {
    if (!userId) return
    listWeights(userId).then(setWeights).catch(() => setWeights([]))
  }, [userId])
  useEffect(() => { loadWeights() }, [loadWeights])

  if (!session || !profile || !latestWeight || !latestGoal || !profile.sex || !profile.date_of_birth || profile.height_cm == null) return null

  const summary = buildEnergySummary({
    sex: profile.sex,
    dob: new Date(profile.date_of_birth + 'T12:00:00'),
    heightCm: profile.height_cm,
    weightKg: latestWeight.weight_kg,
    activityFactor: profile.baseline_activity_level,
    goal: latestGoal.goal,
    today: new Date(),
  })

  const weightPoints = (weights ?? []).map((w) => ({
    t: new Date(w.logged_on + 'T12:00:00').getTime(),
    v: u.toWeight(w.weight_kg),
  }))

  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between border-b border-slate-200 py-2.5 last:border-0 dark:border-slate-700/60">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  )

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setModalOpen(true)} className="rounded-lg bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-800">{t('metrics.logWeight')}</button>
          <Link to="/goals/edit" className="rounded-lg bg-slate-100 px-4 py-3 text-center text-sm font-semibold dark:bg-[#1b2030]">{t('metrics.resetGoal')}</Link>
        </div>

        <div className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
          {row(t('onboarding.sex'), t(`onboarding.${profile.sex}`))}
          {row(t('onboarding.height'), `${u.toHeight(profile.height_cm)} ${u.heightLabel}`)}
          {row(t('metrics.weight'), u.fmtWeight(latestWeight.weight_kg))}
          {row(t('dashboard.bmr'), `${summary.bmr} ${t('dashboard.kcal')}`)}
          {row(t('dashboard.maintenance'), `${Math.round(summary.tdee)} ${t('dashboard.kcal')}`)}
          {row(t('dashboard.target'), `${summary.target} ${t('dashboard.kcal')}`)}
          {row(t('onboarding.goal'), t(`goal.${latestGoal.goal}`))}
        </div>

        {weights !== null && weightPoints.length >= 1 && (
          <div className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
            <h2 className="mb-2 text-sm font-semibold">{t('metrics.weightTrend')}</h2>
            <LineChart
              points={weightPoints}
              formatValue={(v) => `${v.toFixed(1)} ${u.weightLabel}`}
              formatDate={(ms) => shortDate(new Date(ms).toISOString())}
              yLabel={u.weightLabel}
              curve={curve}
            />
            {weightPoints.length < 2 && (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('metrics.notEnoughWeights')}</p>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <LogWeightModal
          userId={session.user.id}
          initialWeight={u.toWeight(latestWeight.weight_kg)}
          onClose={() => setModalOpen(false)}
          onSaved={async () => { await reload(); loadWeights(); setModalOpen(false) }}
        />
      )}
    </div>
  )
}
