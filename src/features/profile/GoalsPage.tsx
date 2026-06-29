import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from './useProfileData'
import { useUnits } from './useUnits'
import { buildEnergySummary } from './energySummary'
import { addWeight, listWeights } from '../../data/weightRepo'
import type { WeightLogRow } from '../../data/rows'
import { LineChart } from '../../components/charts/LineChart'
import { useChartCurve } from '../../prefs/chartPref'
import { shortDate } from '../history/historyFormat'
import { todayIso } from './today'

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
        <LogWeightModal userId={session.user.id} onClose={() => setModalOpen(false)} onSaved={async () => { await reload(); loadWeights(); setModalOpen(false) }} />
      )}
    </div>
  )
}

function LogWeightModal({ userId, onClose, onSaved }: { userId: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const t = useT()
  const u = useUnits()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!value) return
    setBusy(true); setError(null)
    try {
      await addWeight(userId, todayIso(), u.fromWeight(Number(value)))
      await onSaved()
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Metrics] logWeight failed:', err)
      setError(t('common.error'))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="w-full max-w-xs space-y-4 rounded-2xl bg-white p-5 text-slate-900 dark:bg-[#1b2030] dark:text-white" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{t('metrics.logWeight')}</h2>
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder={u.weightLabel}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#0f1115] dark:text-white"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold dark:bg-[#0f1115]">{t('exercises.cancel')}</button>
          <button onClick={save} disabled={busy} className="flex-1 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </div>
    </div>
  )
}
