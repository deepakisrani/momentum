# Sample Day of Eating — Design

**Date:** 2026-06 · **Status:** Approved (pending spec review)
**Context:** A lightweight alternative to the shelved food-logging feature (see `docs/research/2026-06-food-logging-feasibility.md`). No external food DB, no logging, no persistence — just a personalized macro breakdown plus an illustrative day of meals to build from.

## Goal
A new **Nutrition** screen: show the user their daily macro targets (from their existing calorie target + bodyweight), and a **sample day** of meals — veg, egg, or non-veg — whose portions auto-scale to their target in whole units with honestly-recomputed calories. A baseline to fill in the blanks from, not a tracked plan.

## Scope
**In:** macro-target math, veg / egg / non-veg sample-day templates, portion auto-scaling, a `/nutrition` screen (dashboard card), a Settings protein-override control.
**Out:** food logging, meal persistence/editing, external food DBs, barcode, saving a plan. Purely computed/illustrative.

## Architecture

### 1. Macro math — `src/domain/macros.ts` (pure, tested)
```ts
export const DEFAULT_PROTEIN_PER_KG: Record<Goal, number> = { cut: 2.2, maintain: 2.0, bulk: 1.8 }

export interface Macros { proteinG: number; carbG: number; fatG: number; proteinKcal: number; carbKcal: number; fatKcal: number }

// proteinPerKg overrides the goal default when provided (Settings override).
export function computeMacros(targetCalories: number, weightKg: number, goal: Goal, proteinPerKg?: number): Macros
```
- Protein: `round((proteinPerKg ?? DEFAULT_PROTEIN_PER_KG[goal]) * weightKg)` g → ×4 kcal.
- Fat: `round(targetCalories * 0.25)` kcal → `round(/9)` g.
- Carbs: `max(0, targetCalories - proteinKcal - fatKcal)` kcal → `round(/4)` g. (Clamp handles the rare case where protein+fat already exceed target.)
- Macros are grams/kcal — unit-independent, so no metric/imperial conversion needed.

### 2. Sample-day templates — `src/features/nutrition/sampleDayData.ts` (data)
```ts
interface MealItem { name: string; unit: string; perUnitCal: number; perUnitProtein: number; baseQty: number }
interface Meal { key: 'breakfast' | 'lunch' | 'snack' | 'dinner'; items: MealItem[] }
interface DayTemplate { meals: Meal[] } // base day ≈ 2000 kcal

export const VEG_DAY: DayTemplate
export const EGG_DAY: DayTemplate      // eggetarian — eggs but no meat/fish
export const NONVEG_DAY: DayTemplate
```
- Indian-friendly, ~4 meals each, **three templates** (veg / egg / non-veg). The egg day is essentially the veg day with egg-based protein swapped in (omelette/boiled eggs). Item *names* ("chapati", "katori sabzi", "whey scoop", "2 boiled eggs") are **data, not UI chrome** — kept here like the exercise dataset, not in i18n. Meal *labels* (Breakfast/Lunch/…) and all screen text go through i18n.

### 3. Scaling — `src/features/nutrition/scaleDay.ts` (pure, tested)
```ts
export interface ScaledItem { name: string; unit: string; qty: number; cal: number; protein: number }
export interface ScaledMeal { key: string; items: ScaledItem[]; cal: number; protein: number }
export interface ScaledDay { meals: ScaledMeal[]; totalCal: number; totalProtein: number }

export function scaleDay(template: DayTemplate, targetCalories: number): ScaledDay
```
- `base = Σ item.baseQty * item.perUnitCal`; `factor = targetCalories / base`.
- Per item: `qty = max(1, Math.round(baseQty * factor))`; `cal = qty * perUnitCal`; `protein = qty * perUnitProtein`.
- Meal + day totals summed from the rounded items. The day total lands **near** the target (not forced to match) and is shown honestly alongside it.

### 4. Preferences — `src/prefs/` (localStorage, like chartPref/deloadPref)
- `proteinPref.ts`: `number | null` (null = "Auto", derive from goal). `useProteinPerKg()`, `setProteinPerKg()`. Default null.
- `dietPref.ts`: `'veg' | 'egg' | 'nonveg'`, **default `'veg'`**, remembers last choice. `useDiet()`, `setDiet()`.

### 5. Screen — `src/features/nutrition/NutritionPage.tsx` (route `/nutrition`)
- Guarded like GoalsPage (needs profile sex/dob/height/weight); computes `target` via `buildEnergySummary`, `macros` via `computeMacros(target, weightKg, goal, override ?? undefined)`.
- **Top:** macro targets — Calories (target), Protein, Carbs, Fat (grams, with kcal secondary), plus a thin stacked split bar (protein/carb/fat by kcal) for at-a-glance proportion.
- **Diet toggle:** a three-way selector styled as the Indian FSSAI food marks — a filled dot inside a square outline: **green = Veg**, **yellow = Egg**, **red/brown = Non-veg** — with a small text label under each (so selection isn't conveyed by colour alone; each is a `button role="radio"` with an `aria-label`). Selected mark is emphasized (ring/bolder). Backed by `dietPref`.
- **Meals:** a card per meal — label + each item as "`{qty} {unit} {name} — {cal} cal · {protein} g P`" + a meal subtotal. Then a **day total** line: "Sample ≈ {totalCal} kcal · target {target}". A one-line note: "A sample to build from — swap foods you like, keep portions in the ballpark."

### 6. Settings — protein override
A "Protein target" section: a stepper reading **"Auto (from goal)"** by default; stepping right sets an explicit g/kg (e.g. 1.6–3.0 by 0.2), stepping left off the lowest value returns to Auto. Writes `proteinPref`. (Same pattern/feel as the deload stepper.)

### 7. Nav & routing
- Dashboard: a **Nutrition** card → `/nutrition` (joins the responsive card grid).
- `App.tsx`: route under the onboarded/AppLayout group. `AppHeader`: `/nutrition` → `nutrition.title`.

### i18n keys (`en.json`)
`nutrition.title`, `nutrition.veg`, `nutrition.egg`, `nutrition.nonveg`, `nutrition.calories`, `nutrition.protein`, `nutrition.carbs`, `nutrition.fat`, `nutrition.meal.breakfast|lunch|snack|dinner`, `nutrition.sampleTotal`, `nutrition.sampleNote`, `nutrition.proteinShort` ("P"); plus `settings.protein`, `settings.proteinNote`, `settings.proteinAuto`, `settings.proteinLess`, `settings.proteinMore`.

## Edge cases
- Carbs clamp to 0 when protein+fat kcal ≥ target (very low target / high bodyweight) — shown as 0 g.
- `scaleDay` min-1 per item so no meal shows "0 chapati"; very low targets still show a minimal plausible day (day total may exceed a tiny target — acceptable and honest).
- Macros/kcal are unit-independent; no lb/kg conversion.

## Testing
- `macros.test.ts`: goal defaults (cut/maintain/bulk), protein override, carbs clamp.
- `scaleDay.test.ts`: factor scaling, round-to-whole, min-1 floor, recomputed cal/protein, totals.
- Screen + Settings verified via `npm run build` (auth-gated; user eyeballs).

## Files
- New: `src/domain/macros.ts` (+test), `src/features/nutrition/sampleDayData.ts`, `scaleDay.ts` (+test), `NutritionPage.tsx`, `src/prefs/proteinPref.ts`, `src/prefs/dietPref.ts`.
- Edit: `src/App.tsx`, `src/components/AppHeader.tsx`, `src/features/profile/DashboardPage.tsx`, `src/features/settings/SettingsPage.tsx`, `src/i18n/strings/en.json`.
