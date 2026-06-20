import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from './useProfileData'
import { updateProfile } from '../../data/profileRepo'
import { addWeight } from '../../data/weightRepo'
import { addGoal } from '../../data/goalRepo'
import { ACTIVITY_FACTORS, type ActivityLevel } from '../../domain/energy'
import type { Sex, Goal } from '../../domain/types'
import { todayIso } from './today'

const ACTIVITY_LEVELS = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]
const GOALS: Goal[] = ['cut', 'maintain', 'bulk']

export function OnboardingPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { reload } = useProfileData()

  const [sex, setSex] = useState<Sex>('male')
  const [dob, setDob] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [activity, setActivity] = useState<ActivityLevel>('moderately_active')
  const [goal, setGoal] = useState<Goal>('maintain')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session) return null // never rendered outside RequireAuth; guards the assertion below
  const userId = session.user.id

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const today = todayIso()
      await updateProfile(userId, {
        sex,
        date_of_birth: dob,
        height_cm: Number(heightCm),
        baseline_activity_level: ACTIVITY_FACTORS[activity],
        units_pref: 'metric',
      })
      await addWeight(userId, today, Number(weightKg))
      await addGoal(userId, today, goal)
      await reload()
      navigate('/', { replace: true })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Onboarding] save failed:', err)
      setError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-lg bg-white px-3 py-2 text-slate-900 dark:bg-[#1b2030] dark:text-white'

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">{t('onboarding.title')}</h1>

        <label className="block text-sm">{t('onboarding.sex')}
          <select className={field} value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
            <option value="male">{t('onboarding.male')}</option>
            <option value="female">{t('onboarding.female')}</option>
          </select>
        </label>

        <label className="block text-sm">{t('onboarding.dob')}
          <input className={field} type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>

        <label className="block text-sm">{t('onboarding.height')}
          <input className={field} type="number" inputMode="decimal" required min="50" max="260" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
        </label>

        <label className="block text-sm">{t('onboarding.weight')}
          <input className={field} type="number" inputMode="decimal" required min="20" max="400" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
        </label>

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
        <button type="submit" disabled={saving} className="w-full rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
          {saving ? t('common.saving') : t('onboarding.submit')}
        </button>
      </form>
    </div>
  )
}
