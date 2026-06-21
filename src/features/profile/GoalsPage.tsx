import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from './useProfileData'
import { useUnits } from './useUnits'
import { buildEnergySummary } from './energySummary'
import { addWeight } from '../../data/weightRepo'
import { addGoal } from '../../data/goalRepo'
import { todayIso } from './today'
import type { Goal } from '../../domain/types'

const GOALS: Goal[] = ['cut', 'maintain', 'bulk']

export function GoalsPage() {
  const t = useT()
  const { session } = useAuth()
  const { profile, latestWeight, latestGoal, reload } = useProfileData()
  const u = useUnits()
  const [weightInput, setWeightInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session || !profile || !latestWeight || !latestGoal || !profile.sex || !profile.date_of_birth || profile.height_cm == null) return null
  const userId = session.user.id

  const summary = buildEnergySummary({
    sex: profile.sex,
    dob: new Date(profile.date_of_birth + 'T12:00:00'),
    heightCm: profile.height_cm,
    weightKg: latestWeight.weight_kg,
    activityFactor: profile.baseline_activity_level,
    goal: latestGoal.goal,
    today: new Date(),
  })

  async function logWeight() {
    if (!weightInput) return
    setBusy(true); setError(null)
    try { await addWeight(userId, todayIso(), u.fromWeight(Number(weightInput))); setWeightInput(''); await reload() }
    catch (err) { if (import.meta.env.DEV) console.error('[Goals] logWeight failed:', err); setError(t('common.error')) }
    finally { setBusy(false) }
  }
  async function changeGoal(goal: Goal) {
    setBusy(true); setError(null)
    try { await addGoal(userId, todayIso(), goal); await reload() }
    catch (err) { if (import.meta.env.DEV) console.error('[Goals] changeGoal failed:', err); setError(t('common.error')) }
    finally { setBusy(false) }
  }

  const stat = (label: string, value: string) => (
    <div className="rounded-xl bg-slate-100 p-4 text-center dark:bg-[#1b2030]">
      <div className="text-xs uppercase text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-slate-500 dark:text-slate-400">{t('nav.back')}</Link>
          <h1 className="text-xl font-bold">{t('goals.title')}</h1>
          <span className="w-10" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {stat(t('dashboard.bmr'), String(summary.bmr))}
          {stat(t('dashboard.maintenance'), String(Math.round(summary.tdee)))}
          {stat(t('dashboard.target'), String(summary.target))}
        </div>
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">{t('dashboard.kcal')}</p>

        <div className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
          <div className="mb-2 text-sm">{t('dashboard.currentWeight')}: <b>{u.fmtWeight(latestWeight.weight_kg)}</b></div>
          <div className="flex gap-2">
            <input className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#0f1115] dark:text-white" type="number" inputMode="decimal" step="0.1" placeholder={u.weightLabel} value={weightInput} onChange={(e) => setWeightInput(e.target.value)} />
            <button onClick={logWeight} disabled={busy} className="rounded-lg bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{t('dashboard.logWeight')}</button>
          </div>
        </div>

        <div className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
          <div className="mb-2 text-sm">{t('dashboard.currentGoal')}: <b>{t(`goal.${latestGoal.goal}`)}</b></div>
          <div className="flex gap-2">
            {GOALS.map((g) => (
              <button key={g} onClick={() => changeGoal(g)} disabled={busy || g === latestGoal.goal}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${g === latestGoal.goal ? 'bg-brand-600 text-white' : 'bg-white dark:bg-[#0f1115]'}`}>
                {t(`goal.${g}`)}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-center text-sm text-red-500">{error}</p>}
      </div>
    </div>
  )
}
