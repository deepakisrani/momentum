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
import { defaultAnchor } from './weightWheel'
import { WeightWheel } from '../../components/WeightWheel'
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

  // A number in **display** units, like the wheel itself; `u.fromWeight` converts once, at
  // the `addWeight` call below. The `defaultAnchor` arm is unreachable in practice — this page
  // sits behind `RequireOnboarding`, which renders nothing until `latestWeight` exists, so the
  // initialiser never runs without one — but the null check that proves it is below, after the
  // hooks, so the fallback still has to be a real weight rather than an empty field.
  const [weight, setWeight] = useState(() => (latestWeight ? u.toWeight(latestWeight.weight_kg) : defaultAnchor(u.units)))
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
      // No `if (weight)` guard and no `Number(...)`: the wheel's value is always a finite
      // number inside its bounds, so there is no empty case to skip and nothing to coerce.
      await addWeight(userId, todayIso(), u.fromWeight(weight))
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
        {/* A <div>, not a <label>, and not because of styling: the wheel is a composite widget
            that names itself through its own `aria-label`, not a single labelable control. A
            <label> here would have nothing legal to point at — the drum is a div and the typed
            fallback swaps in and out under it — so it would either name nothing or fight the
            aria-label for the announced name. The text stays visible for sighted users, and
            `label` is built from the *same* two pieces so the accessible name is exactly what is
            on screen — "Current weight (kg)". `metrics.weightWheelLabel` ("Weight") would fail
            WCAG 2.5.3 (Label in Name) twice over here: no unit, and not even the same noun as
            the visible text, so a voice-control user saying what they see would miss the field.
            It stays the right label in the modal, which has no visible field text of its own.
            No `autoFocus`: unlike the modal (which destroys its own trigger as it opens), this
            is a page form the user arrived at by navigation, where focus belongs on the document
            so Tab reaches the fields in order. Grabbing it would also scroll the page to the
            drum and, for a screen-reader user, skip straight past the heading. */}
        <div className="block text-sm">{t('onboarding.weight')} ({u.weightLabel})
          <WeightWheel value={weight} onChange={setWeight} unitLabel={u.weightLabel} label={`${t('onboarding.weight')} (${u.weightLabel})`} />
        </div>
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
