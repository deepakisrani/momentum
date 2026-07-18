# Sample Day of Eating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/nutrition` screen showing personalized daily macro targets plus a veg/egg/non-veg sample day whose portions auto-scale to the user's calorie target, with a Settings protein-override.

**Architecture:** Pure macro math (`domain/macros.ts`) and pure day-scaling (`features/nutrition/scaleDay.ts`) are TDD'd; static meal templates are data; two localStorage prefs (protein g/kg override, diet choice) mirror the existing `chartPref`/`deloadPref` pattern; a feature screen composes them. No persistence, no DB, no external food data.

**Tech Stack:** Vite + React + TS + Tailwind, Vitest. Build: `npm run build`. Branch: work on `main` (user manages git).

---

## Conventions
- Pure helpers are TDD'd with Vitest; prefs (localStorage) and React screens are verified via `npm run build` — not unit-tested — matching the codebase.
- All copy via `useT()` → `t('key')` in `src/i18n/strings/en.json`. Meal *item names* are data (in the template module), not i18n.
- Macros are grams/kcal — unit-independent (no metric/imperial conversion).
- Reuse: `buildEnergySummary` (`src/features/profile/energySummary.ts`) for the calorie target; `useProfileData()` gives `{ profile, latestWeight, latestGoal }`; `Goal` from `src/domain/types.ts`.

## File structure
- **Create** `src/domain/macros.ts` (+test) — macro targets from calories/weight/goal.
- **Create** `src/features/nutrition/sampleDayData.ts` — veg/egg/non-veg templates (data).
- **Create** `src/features/nutrition/scaleDay.ts` (+test) — scale a template to a calorie target.
- **Create** `src/prefs/proteinPref.ts`, `src/prefs/dietPref.ts` — localStorage prefs.
- **Create** `src/features/nutrition/NutritionPage.tsx` — the screen.
- **Modify** `src/App.tsx`, `src/components/AppHeader.tsx`, `src/features/profile/DashboardPage.tsx`, `src/features/settings/SettingsPage.tsx`, `src/i18n/strings/en.json`.

---

## Task 1: Macro-target math

**Files:** Create `src/domain/macros.ts`; Test `src/domain/macros.test.ts`

- [ ] **Step 1: Failing test** — `src/domain/macros.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { computeMacros } from './macros'

describe('computeMacros', () => {
  it('maintain: 2.0 g/kg protein, 25% fat, carbs remainder', () => {
    const m = computeMacros(2000, 80, 'maintain')
    expect(m.proteinG).toBe(160)   // 2.0*80
    expect(m.fatG).toBe(56)        // round(500/9)
    expect(m.carbG).toBe(215)      // (2000-640-500)/4
  })
  it('cut uses 2.2 g/kg', () => {
    expect(computeMacros(2000, 80, 'cut').proteinG).toBe(176)
  })
  it('honors a protein/kg override', () => {
    expect(computeMacros(2000, 80, 'maintain', 1.6).proteinG).toBe(128)
  })
  it('clamps carbs to 0 when protein+fat already exceed the target', () => {
    expect(computeMacros(1000, 120, 'cut').carbG).toBe(0) // protein 264g=1056kcal alone
  })
})
```

- [ ] **Step 2: Run** `npm test -- macros` → FAIL (no module).

- [ ] **Step 3: Implement** — `src/domain/macros.ts`

```ts
import type { Goal } from './types'

export const DEFAULT_PROTEIN_PER_KG: Record<Goal, number> = { cut: 2.2, maintain: 2.0, bulk: 1.8 }

export interface Macros {
  proteinG: number; carbG: number; fatG: number
  proteinKcal: number; carbKcal: number; fatKcal: number
}

/** Daily macro targets from calorie target + bodyweight + goal. `proteinPerKg` overrides the goal default. */
export function computeMacros(targetCalories: number, weightKg: number, goal: Goal, proteinPerKg?: number): Macros {
  const gPerKg = proteinPerKg ?? DEFAULT_PROTEIN_PER_KG[goal]
  const proteinG = Math.round(gPerKg * weightKg)
  const proteinKcal = proteinG * 4
  const fatKcal = Math.round(targetCalories * 0.25)
  const fatG = Math.round(fatKcal / 9)
  const carbKcal = Math.max(0, targetCalories - proteinKcal - fatKcal)
  const carbG = Math.round(carbKcal / 4)
  return { proteinG, carbG, fatG, proteinKcal, carbKcal, fatKcal }
}
```

- [ ] **Step 4: Run** `npm test -- macros` → PASS (4).
- [ ] **Step 5: Commit**

```bash
git add src/domain/macros.ts src/domain/macros.test.ts
git commit -m "feat(nutrition): computeMacros (protein by goal/override, fat 25%, carbs remainder)"
```

---

## Task 2: Meal templates + day scaling

**Files:** Create `src/features/nutrition/sampleDayData.ts`, `src/features/nutrition/scaleDay.ts`; Test `src/features/nutrition/scaleDay.test.ts`

- [ ] **Step 1: Create the data module** — `src/features/nutrition/sampleDayData.ts`

```ts
export interface MealItem { name: string; perUnitCal: number; perUnitProtein: number; baseQty: number }
export interface Meal { key: 'breakfast' | 'lunch' | 'snack' | 'dinner'; items: MealItem[] }
export interface DayTemplate { meals: Meal[] }

export const VEG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [
      { name: 'whey scoop', perUnitCal: 120, perUnitProtein: 24, baseQty: 1 },
      { name: 'oats (40g)', perUnitCal: 150, perUnitProtein: 5, baseQty: 1 },
      { name: 'banana', perUnitCal: 105, perUnitProtein: 1, baseQty: 1 },
    ] },
    { key: 'lunch', items: [
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 3 },
      { name: 'katori dal', perUnitCal: 150, perUnitProtein: 9, baseQty: 1 },
      { name: 'katori sabzi', perUnitCal: 120, perUnitProtein: 4, baseQty: 1 },
      { name: 'bowl curd', perUnitCal: 100, perUnitProtein: 6, baseQty: 1 },
    ] },
    { key: 'snack', items: [
      { name: 'roasted chana (40g)', perUnitCal: 160, perUnitProtein: 8, baseQty: 1 },
      { name: 'paneer (50g)', perUnitCal: 130, perUnitProtein: 9, baseQty: 1 },
    ] },
    { key: 'dinner', items: [
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 3 },
      { name: 'katori rajma', perUnitCal: 180, perUnitProtein: 10, baseQty: 1 },
      { name: 'katori mixed veg', perUnitCal: 120, perUnitProtein: 4, baseQty: 1 },
      { name: 'bowl salad', perUnitCal: 50, perUnitProtein: 2, baseQty: 1 },
    ] },
  ],
}

export const EGG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [
      { name: 'boiled egg', perUnitCal: 78, perUnitProtein: 6, baseQty: 3 },
      { name: 'oats (40g)', perUnitCal: 150, perUnitProtein: 5, baseQty: 1 },
      { name: 'banana', perUnitCal: 105, perUnitProtein: 1, baseQty: 1 },
    ] },
    { key: 'lunch', items: [
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 3 },
      { name: 'katori dal', perUnitCal: 150, perUnitProtein: 9, baseQty: 1 },
      { name: 'katori sabzi', perUnitCal: 120, perUnitProtein: 4, baseQty: 1 },
      { name: 'bowl curd', perUnitCal: 100, perUnitProtein: 6, baseQty: 1 },
    ] },
    { key: 'snack', items: [
      { name: 'boiled egg', perUnitCal: 78, perUnitProtein: 6, baseQty: 2 },
      { name: 'roasted chana (40g)', perUnitCal: 160, perUnitProtein: 8, baseQty: 1 },
    ] },
    { key: 'dinner', items: [
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 3 },
      { name: 'katori rajma', perUnitCal: 180, perUnitProtein: 10, baseQty: 1 },
      { name: 'katori mixed veg', perUnitCal: 120, perUnitProtein: 4, baseQty: 1 },
      { name: 'bowl salad', perUnitCal: 50, perUnitProtein: 2, baseQty: 1 },
    ] },
  ],
}

export const NONVEG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [
      { name: 'boiled egg', perUnitCal: 78, perUnitProtein: 6, baseQty: 3 },
      { name: 'oats (40g)', perUnitCal: 150, perUnitProtein: 5, baseQty: 1 },
      { name: 'banana', perUnitCal: 105, perUnitProtein: 1, baseQty: 1 },
    ] },
    { key: 'lunch', items: [
      { name: 'chicken breast (100g)', perUnitCal: 165, perUnitProtein: 31, baseQty: 1 },
      { name: 'katori rice', perUnitCal: 200, perUnitProtein: 4, baseQty: 1 },
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 2 },
      { name: 'bowl salad', perUnitCal: 50, perUnitProtein: 2, baseQty: 1 },
    ] },
    { key: 'snack', items: [
      { name: 'whey scoop', perUnitCal: 120, perUnitProtein: 24, baseQty: 1 },
      { name: 'apple', perUnitCal: 95, perUnitProtein: 1, baseQty: 1 },
    ] },
    { key: 'dinner', items: [
      { name: 'fish fillet (120g)', perUnitCal: 180, perUnitProtein: 26, baseQty: 1 },
      { name: 'katori mixed veg', perUnitCal: 120, perUnitProtein: 4, baseQty: 1 },
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 2 },
    ] },
  ],
}
```

- [ ] **Step 2: Failing test** — `src/features/nutrition/scaleDay.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { scaleDay } from './scaleDay'
import type { DayTemplate } from './sampleDayData'

const tpl: DayTemplate = {
  meals: [{ key: 'lunch', items: [{ name: 'x', perUnitCal: 100, perUnitProtein: 10, baseQty: 2 }] }],
}

describe('scaleDay', () => {
  it('scales quantities to the target and recomputes cal/protein', () => {
    const d = scaleDay(tpl, 400) // base 200 -> factor 2 -> qty 4
    expect(d.meals[0].items[0].qty).toBe(4)
    expect(d.meals[0].items[0].cal).toBe(400)
    expect(d.meals[0].items[0].protein).toBe(40)
    expect(d.totalCal).toBe(400)
    expect(d.totalProtein).toBe(40)
  })
  it('floors every item to at least 1 unit', () => {
    const d = scaleDay(tpl, 50) // factor 0.25 -> round(0.5)=1, min 1
    expect(d.meals[0].items[0].qty).toBe(1)
    expect(d.totalCal).toBe(100)
  })
})
```

- [ ] **Step 3: Run** `npm test -- scaleDay` → FAIL.

- [ ] **Step 4: Implement** — `src/features/nutrition/scaleDay.ts`

```ts
import type { DayTemplate } from './sampleDayData'

export interface ScaledItem { name: string; qty: number; cal: number; protein: number }
export interface ScaledMeal { key: string; items: ScaledItem[]; cal: number; protein: number }
export interface ScaledDay { meals: ScaledMeal[]; totalCal: number; totalProtein: number }

/** Scale a template's portions to `targetCalories` in whole units (min 1), recomputing cal/protein. */
export function scaleDay(template: DayTemplate, targetCalories: number): ScaledDay {
  const base = template.meals.reduce((s, m) => s + m.items.reduce((ms, it) => ms + it.baseQty * it.perUnitCal, 0), 0)
  const factor = base > 0 ? targetCalories / base : 1
  const meals: ScaledMeal[] = template.meals.map((m) => {
    const items = m.items.map((it) => {
      const qty = Math.max(1, Math.round(it.baseQty * factor))
      return { name: it.name, qty, cal: qty * it.perUnitCal, protein: qty * it.perUnitProtein }
    })
    return { key: m.key, items, cal: items.reduce((s, i) => s + i.cal, 0), protein: items.reduce((s, i) => s + i.protein, 0) }
  })
  return { meals, totalCal: meals.reduce((s, m) => s + m.cal, 0), totalProtein: meals.reduce((s, m) => s + m.protein, 0) }
}
```

- [ ] **Step 5: Run** `npm test -- scaleDay` → PASS (2).
- [ ] **Step 6: Commit**

```bash
git add src/features/nutrition/sampleDayData.ts src/features/nutrition/scaleDay.ts src/features/nutrition/scaleDay.test.ts
git commit -m "feat(nutrition): veg/egg/non-veg templates + scaleDay portion scaler"
```

---

## Task 3: Preferences (protein override + diet choice)

**Files:** Create `src/prefs/proteinPref.ts`, `src/prefs/dietPref.ts`

- [ ] **Step 1: Create `src/prefs/proteinPref.ts`**

```ts
import { useSyncExternalStore } from 'react'

const KEY = 'momentum.proteinPerKg'
const listeners = new Set<() => void>()

function read(): number | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = Number(raw)
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

let current = read()

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Protein g/kg override; null = derive from goal. */
export function setProteinPerKg(v: number | null): void {
  current = v
  try {
    if (v === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(v))
  } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function useProteinPerKg(): number | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}
```

- [ ] **Step 2: Create `src/prefs/dietPref.ts`**

```ts
import { useSyncExternalStore } from 'react'

export type Diet = 'veg' | 'egg' | 'nonveg'

const KEY = 'momentum.diet'
const listeners = new Set<() => void>()

function read(): Diet {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'egg' || v === 'nonveg' ? v : 'veg'
  } catch {
    return 'veg'
  }
}

let current = read()

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function setDiet(d: Diet): void {
  current = d
  try { localStorage.setItem(KEY, d) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function useDiet(): Diet {
  return useSyncExternalStore(subscribe, () => current, () => 'veg' as Diet)
}
```

- [ ] **Step 3: Type-check** — `npm run build` → clean.
- [ ] **Step 4: Commit**

```bash
git add src/prefs/proteinPref.ts src/prefs/dietPref.ts
git commit -m "feat(nutrition): protein-override + diet localStorage prefs"
```

---

## Task 4: Nutrition screen + nav + i18n

**Files:** Create `src/features/nutrition/NutritionPage.tsx`; Modify `src/i18n/strings/en.json`, `src/App.tsx`, `src/components/AppHeader.tsx`, `src/features/profile/DashboardPage.tsx`

- [ ] **Step 1: Add i18n keys** — in `src/i18n/strings/en.json`, after the last key (add a comma to it), insert:

```json
  "nutrition.title": "Nutrition",
  "nutrition.veg": "Veg",
  "nutrition.egg": "Egg",
  "nutrition.nonveg": "Non-veg",
  "nutrition.calories": "Calories",
  "nutrition.protein": "Protein",
  "nutrition.carbs": "Carbs",
  "nutrition.fat": "Fat",
  "nutrition.proteinShort": "P",
  "nutrition.meal.breakfast": "Breakfast",
  "nutrition.meal.lunch": "Lunch",
  "nutrition.meal.snack": "Snack",
  "nutrition.meal.dinner": "Dinner",
  "nutrition.sampleTotal": "Sample day",
  "nutrition.target": "target",
  "nutrition.sampleNote": "A sample to build from — swap foods you like, keep the portions in the ballpark."
```

Verify: `node -e "require('./src/i18n/strings/en.json')"`.

- [ ] **Step 2: Create `src/features/nutrition/NutritionPage.tsx`**

```tsx
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
        {/* macro targets */}
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

        {/* diet toggle (FSSAI-style marks) */}
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

        {/* meals */}
        {day.meals.map((m) => (
          <div key={m.key} className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">{t(`nutrition.meal.${m.key}`)}</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{m.cal} {t('dashboard.kcal')} · {m.protein} g {t('nutrition.proteinShort')}</span>
            </div>
            <ul className="space-y-1 text-sm">
              {m.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{it.qty} × {it.name}</span>
                  <span className="shrink-0 text-slate-500 dark:text-slate-400 tabular-nums">{it.cal} {t('dashboard.kcal')} · {it.protein} g</span>
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
```

- [ ] **Step 3: Route** — `src/App.tsx`: add import `import { NutritionPage } from './features/nutrition/NutritionPage'` with the other feature imports, and inside the `RequireOnboarding`/`AppLayout` group add:

```tsx
                  <Route path="/nutrition" element={<NutritionPage />} />
```

- [ ] **Step 4: Header title** — `src/components/AppHeader.tsx`, before the final `return null` in `titleKey`:

```ts
  if (path === '/nutrition') return 'nutrition.title'
```

- [ ] **Step 5: Dashboard card** — `src/features/profile/DashboardPage.tsx`, inside the `<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">`, after the Progress link:

```tsx
            <Link to="/nutrition" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('nutrition.title')}</Link>
```

- [ ] **Step 6: Build** — `npm run build` → clean.
- [ ] **Step 7: Commit**

```bash
git add src/features/nutrition/NutritionPage.tsx src/i18n/strings/en.json src/App.tsx src/components/AppHeader.tsx src/features/profile/DashboardPage.tsx
git commit -m "feat(nutrition): Nutrition screen (macros + veg/egg/non-veg sample day) + nav"
```

---

## Task 5: Settings protein override

**Files:** Modify `src/features/settings/SettingsPage.tsx`, `src/i18n/strings/en.json`

- [ ] **Step 1: i18n keys** — add after the deload keys in `en.json`:

```json
  "settings.protein": "Protein target",
  "settings.proteinNote": "Grams per kg bodyweight for your daily protein target. Auto uses your goal.",
  "settings.proteinAuto": "Auto (from goal)",
  "settings.proteinLess": "Decrease protein target",
  "settings.proteinMore": "Increase protein target",
```

- [ ] **Step 2: Wire the pref** — in `src/features/settings/SettingsPage.tsx` add the import next to the other prefs:

```tsx
import { useProteinPerKg, setProteinPerKg } from '../../prefs/proteinPref'
```

Add near the other pref hooks (e.g. after `const deloadPct = useDeloadPct()`):

```tsx
  const proteinPerKg = useProteinPerKg()
  const stepProtein = (dir: 1 | -1) => {
    if (proteinPerKg == null) { if (dir === 1) setProteinPerKg(1.6) } // Auto -> 1.6
    else {
      const next = Math.round((proteinPerKg + dir * 0.2) * 10) / 10
      if (next < 1.6) setProteinPerKg(null)          // below floor -> Auto
      else setProteinPerKg(Math.min(3.0, next))
    }
  }
```

- [ ] **Step 3: Add the section** — place it right after the Deload `</section>` in the JSX:

```tsx
        <section className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
          <h2 className="mb-1 text-sm font-semibold">{t('settings.protein')}</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('settings.proteinNote')}</p>
          <div className="flex items-center gap-4">
            <button onClick={() => stepProtein(-1)} aria-label={t('settings.proteinLess')} className="h-9 w-9 rounded-lg bg-white text-lg font-bold leading-none dark:bg-[#0f1115]">−</button>
            <span className="min-w-[7ch] text-center text-base font-semibold tabular-nums">{proteinPerKg == null ? t('settings.proteinAuto') : `${proteinPerKg.toFixed(1)} g/kg`}</span>
            <button onClick={() => stepProtein(1)} disabled={proteinPerKg != null && proteinPerKg >= 3.0} aria-label={t('settings.proteinMore')} className="h-9 w-9 rounded-lg bg-white text-lg font-bold leading-none disabled:opacity-40 dark:bg-[#0f1115]">+</button>
          </div>
        </section>
```

- [ ] **Step 4: Build** — `npm run build` → clean.
- [ ] **Step 5: Commit**

```bash
git add src/features/settings/SettingsPage.tsx src/i18n/strings/en.json
git commit -m "feat(nutrition): Settings protein g/kg override (Auto or custom)"
```

---

## Task 6: Final verification

- [ ] **Step 1:** `npm run build` → `✓ built`, `dist/sw.js`, no errors.
- [ ] **Step 2:** `npm test` → all pass (123 prior + 6 new = 129).
- [ ] **Step 3:** `git status --short` → empty.

---

## Out of scope
Food logging, meal persistence/editing, external food DBs, saving a plan.
