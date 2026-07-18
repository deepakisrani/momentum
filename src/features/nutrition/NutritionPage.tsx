import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from '../profile/useProfileData'
import { buildEnergySummary } from '../profile/energySummary'
import { computeMacros } from '../../domain/macros'
import { scaleDay } from './scaleDay'
import { VEG_DAY, EGG_DAY, NONVEG_DAY, type DayTemplate } from './sampleDayData'
import { useProteinPerKg } from '../../prefs/proteinPref'
import { useDiet, setDiet, type Diet } from '../../prefs/dietPref'

const TEMPLATES: Record<Diet, DayTemplate> = { veg: VEG_DAY, egg: EGG_DAY, nonveg: NONVEG_DAY }
const DOT: Record<Diet, string> = { veg: 'bg-green-600', egg: 'bg-yellow-500', nonveg: 'bg-red-600' }
const RING: Record<Diet, string> = { veg: 'border-green-600', egg: 'border-yellow-500', nonveg: 'border-red-600' }

export function NutritionPage() {
  const t = useT()
  const { session } = useAuth()
  const { profile, latestWeight, latestGoal } = useProfileData()
  const proteinOverride = useProteinPerKg()
  const diet = useDiet()

  if (!session || !profile || !latestWeight || !latestGoal || !profile.sex || !profile.date_of_birth || profile.height_cm == null) return null

  const { target } = buildEnergySummary({
    sex: profile.sex,
    dob: new Date(profile.date_of_birth + 'T12:00:00'),
    heightCm: profile.height_cm,
    weightKg: latestWeight.weight_kg,
    activityFactor: profile.baseline_activity_level,
    goal: latestGoal.goal,
    today: new Date(),
  })
  const macros = computeMacros(target, latestWeight.weight_kg, latestGoal.goal, proteinOverride ?? undefined)
  const day = scaleDay(TEMPLATES[diet], target)
  const totKcal = macros.proteinKcal + macros.carbKcal + macros.fatKcal || 1

  const stat = (label: string, grams: number) => (
    <div className="text-center">
      <div className="text-lg font-bold tabular-nums">{grams}<span className="text-xs font-normal text-slate-500 dark:text-slate-400"> g</span></div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
          <div className="mb-1 text-sm text-slate-500 dark:text-slate-400">{t('nutrition.calories')}</div>
          <div className="mb-3 text-2xl font-bold tabular-nums">{target} {t('dashboard.kcal')}</div>
          <div className="mb-3 flex h-2 overflow-hidden rounded-full">
            <div className="bg-brand-700" style={{ width: `${(macros.proteinKcal / totKcal) * 100}%` }} />
            <div className="bg-brand-400" style={{ width: `${(macros.carbKcal / totKcal) * 100}%` }} />
            <div className="bg-slate-400" style={{ width: `${(macros.fatKcal / totKcal) * 100}%` }} />
          </div>
          <div className="grid grid-cols-3">
            {stat(t('nutrition.protein'), macros.proteinG)}
            {stat(t('nutrition.carbs'), macros.carbG)}
            {stat(t('nutrition.fat'), macros.fatG)}
          </div>
        </div>

        <div role="radiogroup" aria-label={t('nutrition.title')} className="flex gap-2">
          {(['veg', 'egg', 'nonveg'] as Diet[]).map((d) => {
            const active = diet === d
            return (
              <button key={d} role="radio" aria-checked={active} aria-label={t(`nutrition.${d}`)} onClick={() => setDiet(d)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-lg border p-2 ${active ? 'border-slate-400 bg-slate-100 dark:bg-[#1b2030]' : 'border-transparent'}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-sm border-2 ${RING[d]}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${DOT[d]}`} />
                </span>
                <span className={`text-xs ${active ? 'font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>{t(`nutrition.${d}`)}</span>
              </button>
            )
          })}
        </div>

        {day.meals.map((m) => (
          <div key={m.key} className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">{t(`nutrition.meal.${m.key}`)}</h2>
              <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{m.cal} {t('dashboard.kcal')} · {m.protein} g {t('nutrition.proteinShort')}</span>
            </div>
            <ul className="space-y-1 text-sm">
              {m.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{it.qty} × {it.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{it.cal} {t('dashboard.kcal')} · {it.protein} g</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="text-sm text-slate-500 dark:text-slate-400">
          {t('nutrition.sampleTotal')}: {day.totalCal} {t('dashboard.kcal')} · {day.totalProtein} g {t('nutrition.proteinShort')} <span className="opacity-70">({t('nutrition.target')} {target})</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('nutrition.sampleNote')}</p>
      </div>
    </div>
  )
}
