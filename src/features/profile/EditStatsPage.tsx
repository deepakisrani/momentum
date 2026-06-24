import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from './useProfileData'
import { useUnits } from './useUnits'
import { updateProfile } from '../../data/profileRepo'
import { addWeight } from '../../data/weightRepo'
import { addGoal } from '../../data/goalRepo'
import { todayIso } from './today'
import { ageFromDate, ACTIVITY_FACTORS, type ActivityLevel } from '../../domain/energy'
import type { Goal } from '../../domain/types'

const ACTIVITY_LEVELS = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]
const GOALS: Goal[] = ['cut', 'maintain', 'bulk']

export function EditStatsPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { profile, latestWeight, latestGoal, reload } = useProfileData()
  const u = useUnits()

  const showHeight = useMemo(() => {
    if (!profile?.date_of_birth) return false
    return ageFromDate(new Date(profile.date_of_birth + 'T12:00:00'), new Date()) < 18
  }, [profile])

  const currentActivity = useMemo<ActivityLevel>(() => {
    const f = profile?.baseline_activity_level ?? 0
    return ACTIVITY_LEVELS.find((k) => Math.abs(ACTIVITY_FACTORS[k] - f) < 1e-6) ?? 'moderately_active'
  }, [profile])

  const [weight, setWeight] = useState(() => (latestWeight ? String(u.toWeight(latestWeight.weight_kg)) : ''))
  const [heightVal, setHeightVal] = useState(() => (profile?.height_cm != null ? String(u.toHeight(profile.height_cm)) : ''))
  const [goal, setGoal] = useState<Goal>(latestGoal?.goal ?? 'maintain')
  const [activity, setActivity] = useState<ActivityLevel>(currentActivity)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session || !profile || !latestWeight || !latestGoal) return null
  const userId = session.user.id

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const fields: { baseline_activity_level: number; height_cm?: number } = { baseline_activity_level: ACTIVITY_FACTORS[activity] }
      if (showHeight && heightVal) fields.height_cm = u.fromHeight(Number(heightVal))
      await updateProfile(userId, fields)
      if (weight) await addWeight(userId, todayIso(), u.fromWeight(Number(weight)))
      await addGoal(userId, todayIso(), goal)
      await reload()
      navigate('/goals', { replace: true })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Metrics] reset goal failed:', err)
      setError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white'

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <form onSubmit={save} className="mx-auto max-w-lg space-y-4">
        <label className="block text-sm">{t('onboarding.weight')} ({u.weightLabel})
          <input className={field} type="number" inputMode="decimal" step="0.1" required value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        {showHeight && (
          <label className="block text-sm">{t('onboarding.height')} ({u.heightLabel})
            <input className={field} type="number" inputMode="decimal" required value={heightVal} onChange={(e) => setHeightVal(e.target.value)} />
          </label>
        )}
        <label className="block text-sm">{t('onboarding.activity')}
          <select className={field} value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
            {ACTIVITY_LEVELS.map((a) => <option key={a} value={a}>{t(`activity.${a}`)}</option>)}
          </select>
        </label>
        <label className="block text-sm">{t('onboarding.goal')}
          <select className={field} value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
            {GOALS.map((g) => <option key={g} value={g}>{t(`goal.${g}`)}</option>)}
          </select>
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={saving} className="w-full rounded-lg bg-brand-700 px-5 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </form>
    </div>
  )
}
