import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from './useProfileData'
import { updateProfile } from '../../data/profileRepo'
import { addWeight } from '../../data/weightRepo'
import { addGoal } from '../../data/goalRepo'
import { ACTIVITY_FACTORS, type ActivityLevel } from '../../domain/energy'
import type { Sex, Goal, Units } from '../../domain/types'
import { fromInputWeight, fromInputHeight, weightUnitLabel, heightUnitLabel } from './unitsFormat'
import { todayIso } from './today'
import { defaultAnchor } from './weightWheel'
import { rebaseWeightForUnits, rebaseHeightForUnits, HEIGHT_MIN, HEIGHT_MAX } from './rebaseForUnits'
import { Wordmark } from '../../components/Wordmark'
import { WeightWheel } from '../../components/WeightWheel'

const ACTIVITY_LEVELS = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]
const GOALS: Goal[] = ['cut', 'maintain', 'bulk']

export function OnboardingPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { reload } = useProfileData()

  const [units, setUnits] = useState<Units>('metric')
  const [sex, setSex] = useState<Sex>('male')
  const [dob, setDob] = useState('')
  const [heightCm, setHeightCm] = useState('')
  // In **display** units, not kg — hence the rename off the old `weightKg`, which held a
  // display-unit string too and would now be an outright lie next to a units toggle. The wheel
  // always has a value, so unlike the input it replaces this question starts pre-filled; a
  // user who ignores it therefore submits the anchor rather than being stopped by `required`.
  const [weight, setWeight] = useState(() => defaultAnchor(units))
  const [activity, setActivity] = useState<ActivityLevel>('moderately_active')
  const [goal, setGoal] = useState<Goal>('maintain')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Whether the user has actually engaged with the weight wheel. Every other required answer
  // is either empty until filled or a deliberate choice; the wheel is the one control that
  // arrives holding a plausible-looking number, so without this a user can scroll straight past
  // the question and submit the default as though it were their answer. That matters more here
  // than at any other call site: it is the *first* weight, it feeds BMR across the dashboard,
  // goals and nutrition screens, and there is no prior value to sanity-check it against.
  //
  // Keyed off the user's own gestures, NOT the wheel's onChange. A unit switch rebases the
  // value, which glides the drum, and a programmatic scroll commits the rows it passes through
  // -- so onChange would mark this touched when the user only changed kg to lb.
  const [weightTouched, setWeightTouched] = useState(false)

  if (!session) return null // never rendered outside RequireAuth; guards the assertion below
  const userId = session.user.id

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    // The wheel has no native validity to hook into, so this stands in for `required`.
    if (!weightTouched) { setError(t('onboarding.confirmWeight')); return }
    setSaving(true)
    setError(null)
    try {
      const today = todayIso()
      await updateProfile(userId, {
        sex,
        date_of_birth: dob,
        height_cm: fromInputHeight(Number(heightCm), units),
        baseline_activity_level: ACTIVITY_FACTORS[activity],
        units_pref: units,
      })
      await addWeight(userId, today, fromInputWeight(weight, units))
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

  /** Switch unit systems without changing which body the user described.
   *
   * Both fields hold numbers in *display* units, so a plain `setUnits` reinterprets them where
   * they sit: 80 kg read as 80 lb stores 36.3 kg, and 70 in read as 70 cm stores a 70 cm adult.
   * Convert both instead — see `rebaseForUnits.ts` for why every value is converted rather than
   * only an untouched default, and for how much damage the height case did unnoticed.
   *
   * `units` here is the *previous* system: this closure belongs to the render that was showing
   * it, and both updaters run before `setUnits` takes effect. Functional updaters rather than
   * `setWeight(rebase(weight, …))`, so a commit landing in the same batch — the typed fallback
   * blurring as the picker opens — is rebased instead of discarded. */
  function changeUnits(next: Units) {
    setWeight((w) => rebaseWeightForUnits(w, units, next))
    setHeightCm((h) => rebaseHeightForUnits(h, units, next))
    setUnits(next)
  }

  const field = 'w-full rounded-lg bg-white px-3 py-2 text-slate-900 dark:bg-[#1b2030] dark:text-white'

  // Read from the same table the rebase clamps against, so the input cannot declare a range
  // its own unit switch would land outside of.
  const heightMin = HEIGHT_MIN[units]
  const heightMax = HEIGHT_MAX[units]

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4">
        <Wordmark className="mx-auto mb-2 h-9" />
        <h1 className="text-2xl font-bold">{t('onboarding.title')}</h1>

        <label className="block text-sm">{t('onboarding.units')}
          <select className={field} value={units} onChange={(e) => changeUnits(e.target.value as Units)}>
            <option value="metric">{t('settings.units.metric')}</option>
            <option value="imperial">{t('settings.units.imperial')}</option>
          </select>
        </label>

        <label className="block text-sm">{t('onboarding.sex')}
          <select className={field} value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
            <option value="male">{t('onboarding.male')}</option>
            <option value="female">{t('onboarding.female')}</option>
          </select>
        </label>

        <label className="block text-sm">{t('onboarding.dob')}
          <input className={field} type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>

        <label className="block text-sm">{t('onboarding.height')} ({heightUnitLabel(units)})
          <input className={field} type="number" inputMode="decimal" required min={heightMin} max={heightMax} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
        </label>

        {/* A <div>, not a <label>: the wheel is a composite widget that names itself with its
            own `aria-label`, so there is no single labelable control for a <label> to point at
            — it would either name nothing or compete with that aria-label. The visible text
            stays for sighted users, and `label` is built from the same two pieces so the
            accessible name is exactly what is on screen (WCAG 2.5.3, Label in Name — the
            wheel's own `metrics.weightWheelLabel` is "Weight", which is neither the visible
            noun nor unit-qualified). The old input's `min`/`max` are gone with it — the wheel
            clamps in JS instead — which does shift the imperial range: 20–400 lb in place of
            40–900. Both ends are far outside a real bodyweight, and the wheel's bounds are
            deliberately unit-agnostic (see WHEEL_MIN/WHEEL_MAX), so this is left alone here.
            No `autoFocus` — it is the fifth question here, and grabbing focus on load would
            drop a keyboard or screen-reader user straight past units, sex, DOB and height. */}
        <div className="block text-sm">{t('onboarding.weight')} ({weightUnitLabel(units)})
          {/* Capture phase, so a gesture anywhere inside the control counts -- dragging the drum,
              an arrow key, or typing in the "Type value" fallback -- without WeightWheel needing
              to know this requirement exists. */}
          <div onPointerDownCapture={() => setWeightTouched(true)} onKeyDownCapture={() => setWeightTouched(true)}>
            <WeightWheel value={weight} onChange={setWeight} unitLabel={weightUnitLabel(units)} label={`${t('onboarding.weight')} (${weightUnitLabel(units)})`} />
          </div>
        </div>

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
        <button type="submit" disabled={saving} className="w-full rounded-lg bg-brand-700 hover:bg-brand-800 px-5 py-3 font-semibold text-white disabled:opacity-60">
          {saving ? t('common.saving') : t('onboarding.submit')}
        </button>
      </form>
    </div>
  )
}
