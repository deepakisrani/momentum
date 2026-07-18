# Protein-first sample-day planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/nutrition` sample day treat protein as a first-class target — adding lean protein and (capped) whey to hit the protein goal under a goal-dependent calorie policy — instead of letting protein fall out of calorie-only scaling.

**Architecture:** Two phases. Phase 1 reuses the existing calorie-fit scaler (extracted into a shared `scaleToCalories` primitive). Phase 2 (`planDay`) reconciles protein: on a cut it fills lean protein under a hard calorie ceiling, trimming filler to make room and finishing with whey; on bulk/maintain it hits protein first (calories may flex up), then settles calories with filler. Per-food role/min/max/finisher tags drive both phases.

**Tech Stack:** TypeScript, React, Vitest. All client-side; no DB change.

Design spec: `docs/superpowers/specs/2026-07-19-protein-first-day-planner-design.md`

---

## File Structure

- `src/features/nutrition/sampleDayData.ts` — MODIFY: add `role`/`min`/`max`/`finisher` to `MealItem`; tag every food.
- `src/features/nutrition/scaleDay.ts` — MODIFY: extract `scaleToCalories(template, targetCalories): Work[]` and `buildScaledDay(template, flat): ScaledDay`; make bounds respect `[min, max]`; `scaleDay` becomes a thin wrapper. Export `Work` and the primitives.
- `src/features/nutrition/planDay.ts` — CREATE: `planDay(template, { targetCalories, targetProtein, goal }): ScaledDay`.
- `src/features/nutrition/planDay.test.ts` — CREATE: behavior tests.
- `src/features/nutrition/scaleDay.test.ts` — MODIFY: add a max-clamp test; existing tests stay green.
- `src/features/nutrition/NutritionPage.tsx` — MODIFY: call `planDay` instead of `scaleDay`.

Commands (run from repo root `/Users/deepakisrani/Documents/momentum`):
- Single test file: `npm test -- src/features/nutrition/planDay.test.ts`
- Full suite: `npm test`
- Build: `npm run build`

---

## Task 1: Extract calorie-fit primitives in scaleDay, respecting [min, max]

**Files:**
- Modify: `src/features/nutrition/scaleDay.ts`
- Test: `src/features/nutrition/scaleDay.test.ts`

- [ ] **Step 1: Add a failing max-clamp test**

Append to `src/features/nutrition/scaleDay.test.ts` inside the existing `describe('scaleDay', ...)`:

```ts
  it('never scales an item above its max', () => {
    const t: DayTemplate = {
      meals: [{ key: 'lunch', items: [
        { name: 'capped', perUnitCal: 100, perUnitProtein: 10, perUnitFat: 2, baseQty: 1, max: 2 },
      ] }],
    }
    // factor 500/100 = 5 would round to qty 5, but max caps it at 2.
    const d = scaleDay(t, 500)
    expect(d.meals[0].items[0].qty).toBe(2)
    expect(d.totalCal).toBe(200)
  })
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/features/nutrition/scaleDay.test.ts`
Expected: FAIL — current code has no `max` clamp, so qty is 5 (totalCal 500).

- [ ] **Step 3: Refactor scaleDay.ts to primitives with bounds**

Replace the entire body of `src/features/nutrition/scaleDay.ts` (keep the file's existing interfaces `ScaledItem`, `ScaledMeal`, `ScaledDay` exactly as they are, including `totalFat`/`totalCarbs`) with:

```ts
import type { DayTemplate, MealItem } from './sampleDayData'

export interface ScaledItem { name: string; qty: number; cal: number; protein: number }
export interface ScaledMeal { key: string; items: ScaledItem[]; cal: number; protein: number }
export interface ScaledDay { meals: ScaledMeal[]; totalCal: number; totalProtein: number; totalFat: number; totalCarbs: number }

export interface Work { mi: number; ii: number; it: MealItem; qty: number }

const minOf = (it: MealItem) => it.min ?? 1
const maxOf = (it: MealItem) => it.max ?? Infinity
const clampQty = (q: number, it: MealItem) => Math.min(maxOf(it), Math.max(minOf(it), q))

/**
 * Phase 1: scale a template's portions to `targetCalories` in WHOLE units,
 * clamped to each item's [min, max]. A first pass rounds `baseQty * factor`; a
 * greedy pass then applies the single +/-1 move (within bounds) that most reduces
 * the calorie gap, until no move improves. Returns the flat work list so callers
 * (scaleDay, planDay) can refine quantities before building the day.
 */
export function scaleToCalories(template: DayTemplate, targetCalories: number): Work[] {
  const flat: Work[] = template.meals.flatMap((m, mi) => m.items.map((it, ii) => ({ mi, ii, it, qty: 0 })))
  const base = flat.reduce((s, f) => s + f.it.baseQty * f.it.perUnitCal, 0)
  const factor = base > 0 ? targetCalories / base : 1
  for (const f of flat) f.qty = clampQty(Math.round(f.it.baseQty * factor), f.it)

  const total = () => flat.reduce((s, f) => s + f.qty * f.it.perUnitCal, 0)
  for (;;) {
    const cur = total()
    const gap = Math.abs(targetCalories - cur)
    let best: { f: Work; delta: number; gap: number } | null = null
    for (const f of flat) {
      for (const delta of [1, -1] as const) {
        if (delta === 1 && f.qty >= maxOf(f.it)) continue
        if (delta === -1 && f.qty <= minOf(f.it)) continue
        const g = Math.abs(targetCalories - (cur + delta * f.it.perUnitCal))
        if (g < gap && (best === null || g < best.gap)) best = { f, delta, gap: g }
      }
    }
    if (best === null) break
    best.f.qty += best.delta
  }
  return flat
}

/** Build the display day (with derived fat/carbs) from a finalized work list. */
export function buildScaledDay(template: DayTemplate, flat: Work[]): ScaledDay {
  const qtyOf = (mi: number, ii: number) => flat.find((f) => f.mi === mi && f.ii === ii)!.qty
  const meals: ScaledMeal[] = template.meals.map((m, mi) => {
    const items = m.items.map((it, ii) => {
      const qty = qtyOf(mi, ii)
      return { name: it.name, qty, cal: qty * it.perUnitCal, protein: qty * it.perUnitProtein }
    })
    return { key: m.key, items, cal: items.reduce((s, i) => s + i.cal, 0), protein: items.reduce((s, i) => s + i.protein, 0) }
  })
  // Carbs are the calorie remainder after protein (4 kcal/g) and fat (9 kcal/g),
  // floored at 0; summed unrounded so per-item rounding doesn't drift the total.
  const totalFat = Math.round(flat.reduce((s, f) => s + f.qty * f.it.perUnitFat, 0))
  const carbKcal = flat.reduce((s, f) => s + Math.max(0, f.qty * f.it.perUnitCal - 4 * f.qty * f.it.perUnitProtein - 9 * f.qty * f.it.perUnitFat), 0)
  const totalCarbs = Math.round(carbKcal / 4)
  return { meals, totalCal: meals.reduce((s, m) => s + m.cal, 0), totalProtein: meals.reduce((s, m) => s + m.protein, 0), totalFat, totalCarbs }
}

/** Calorie-only scale (used where protein isn't a target). */
export function scaleDay(template: DayTemplate, targetCalories: number): ScaledDay {
  return buildScaledDay(template, scaleToCalories(template, targetCalories))
}
```

- [ ] **Step 4: Run the scaleDay suite to confirm all green**

Run: `npm test -- src/features/nutrition/scaleDay.test.ts`
Expected: PASS — the new max-clamp test plus all pre-existing scaleDay tests (defaults `min: 1`, `max: Infinity` preserve old behavior).

- [ ] **Step 5: Commit**

```bash
git add src/features/nutrition/scaleDay.ts src/features/nutrition/scaleDay.test.ts
git commit -m "refactor: extract scaleToCalories/buildScaledDay with min/max clamps"
```

---

## Task 2: Add role/min/max/finisher tags to the food data

**Files:**
- Modify: `src/features/nutrition/sampleDayData.ts`
- Test: `src/features/nutrition/sampleDayData.test.ts` (create)

- [ ] **Step 1: Write a failing data-sanity test**

Create `src/features/nutrition/sampleDayData.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { VEG_DAY, EGG_DAY, NONVEG_DAY, type DayTemplate } from './sampleDayData'

const items = (t: DayTemplate) => t.meals.flatMap((m) => m.items)

describe('sampleDayData tags', () => {
  it('marks whey as a capped finisher in every template', () => {
    for (const t of [VEG_DAY, EGG_DAY, NONVEG_DAY]) {
      const whey = items(t).find((i) => i.name === 'whey scoop')
      expect(whey).toBeDefined()
      expect(whey!.role).toBe('protein')
      expect(whey!.finisher).toBe(true)
      expect(whey!.max).toBe(3)
    }
  })
  it('tags lean proteins as protein and carbs as filler', () => {
    const veg = items(VEG_DAY)
    expect(veg.find((i) => i.name === 'soya chunks (30g)')!.role).toBe('protein')
    expect(veg.find((i) => i.name === 'tofu (100g)')!.role).toBe('protein')
    expect(veg.find((i) => i.name === 'oats (40g)')!.role).toBe('filler')
    expect(veg.find((i) => i.name === 'chapati')!.role).toBe('filler')
    expect(veg.find((i) => i.name === 'katori dal')!.role).toBe('fixed')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/features/nutrition/sampleDayData.test.ts`
Expected: FAIL — `role`/`finisher` are `undefined` (fields don't exist yet).

- [ ] **Step 3: Add the fields to the interface and tag every item**

Replace the entire contents of `src/features/nutrition/sampleDayData.ts` with:

```ts
export type FoodRole = 'protein' | 'filler' | 'fixed'

export interface MealItem {
  name: string
  perUnitCal: number
  perUnitProtein: number
  perUnitFat: number
  baseQty: number
  // Planner tags (optional; default role 'fixed', min 1, max Infinity, finisher false):
  role?: FoodRole
  min?: number
  max?: number
  finisher?: boolean
}
export interface Meal { key: 'breakfast' | 'lunch' | 'snack' | 'dinner'; items: MealItem[] }
export interface DayTemplate { meals: Meal[] }

// Protein-forward templates for a lifting cut: chosen for a high protein:calorie
// ratio (~80-85 g protein per 1000 kcal). Fat is grams per unit (USDA / IFCT),
// kept under (cal - protein*4)/9 so derived carbs stay >= 0. Carbs are not stored
// — buildScaledDay derives them as the calorie remainder.
//
// role: 'protein' = lean top-up lever the planner ADDS (up to max); 'filler' =
// carb/energy food the planner TRIMS (down to min) to free calories on a cut;
// 'fixed' = staple that scales for calories but the protein optimizer leaves alone.
// finisher: true marks whey, added only after whole-food protein is exhausted.

const WHEY: MealItem = { name: 'whey scoop', perUnitCal: 120, perUnitProtein: 24, perUnitFat: 1.5, baseQty: 1, role: 'protein', min: 0, max: 3, finisher: true }
const OATS: MealItem = { name: 'oats (40g)', perUnitCal: 150, perUnitProtein: 5, perUnitFat: 3, baseQty: 1, role: 'filler', min: 0, max: 2 }
const EGG: MealItem = { name: 'boiled egg', perUnitCal: 78, perUnitProtein: 6, perUnitFat: 5.3, baseQty: 2, role: 'protein', min: 1, max: 4 }
const EGG_WHITE: MealItem = { name: 'egg white', perUnitCal: 18, perUnitProtein: 4, perUnitFat: 0, baseQty: 4, role: 'protein', min: 0, max: 8 }
const CHAPATI: MealItem = { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, perUnitFat: 0.5, baseQty: 3, role: 'filler', min: 1, max: 4 }
const DAL: MealItem = { name: 'katori dal', perUnitCal: 150, perUnitProtein: 9, perUnitFat: 5, baseQty: 1, role: 'fixed', min: 1, max: 2 }
const SOYA: MealItem = { name: 'soya chunks (30g)', perUnitCal: 100, perUnitProtein: 16, perUnitFat: 1, baseQty: 1, role: 'protein', min: 1, max: 3 }
const CURD: MealItem = { name: 'bowl curd', perUnitCal: 100, perUnitProtein: 6, perUnitFat: 5, baseQty: 1, role: 'fixed', min: 1, max: 2 }
const RAJMA: MealItem = { name: 'katori rajma', perUnitCal: 180, perUnitProtein: 10, perUnitFat: 6, baseQty: 1, role: 'fixed', min: 1, max: 2 }
const TOFU: MealItem = { name: 'tofu (100g)', perUnitCal: 120, perUnitProtein: 13, perUnitFat: 7, baseQty: 1, role: 'protein', min: 1, max: 2 }
const SALAD: MealItem = { name: 'bowl salad', perUnitCal: 50, perUnitProtein: 2, perUnitFat: 0.5, baseQty: 1, role: 'fixed', min: 1, max: 1 }
const CHICKEN: MealItem = { name: 'chicken breast (100g)', perUnitCal: 165, perUnitProtein: 31, perUnitFat: 4.5, baseQty: 1, role: 'protein', min: 1, max: 2 }
const RICE: MealItem = { name: 'katori rice', perUnitCal: 200, perUnitProtein: 4, perUnitFat: 0.5, baseQty: 1, role: 'filler', min: 0, max: 2 }
const MIXED_VEG: MealItem = { name: 'katori mixed veg', perUnitCal: 120, perUnitProtein: 4, perUnitFat: 7, baseQty: 1, role: 'fixed', min: 1, max: 1 }
const FISH: MealItem = { name: 'fish fillet (120g)', perUnitCal: 180, perUnitProtein: 26, perUnitFat: 8, baseQty: 1, role: 'protein', min: 1, max: 2 }

// baseQty is instance-specific; clone per placement so per-meal portions differ.
const at = (item: MealItem, baseQty: number): MealItem => ({ ...item, baseQty })

export const VEG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [at(WHEY, 1), at(OATS, 1)] },
    { key: 'lunch', items: [at(CHAPATI, 3), at(DAL, 1), at(SOYA, 1), at(CURD, 1)] },
    { key: 'snack', items: [at(WHEY, 1)] },
    { key: 'dinner', items: [at(CHAPATI, 3), at(RAJMA, 1), at(TOFU, 1), at(SALAD, 1)] },
  ],
}

export const EGG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [at(EGG, 2), at(EGG_WHITE, 4), at(OATS, 1)] },
    { key: 'lunch', items: [at(CHAPATI, 3), at(DAL, 1), at(EGG, 2), at(CURD, 1)] },
    { key: 'snack', items: [at(WHEY, 1)] },
    { key: 'dinner', items: [at(CHAPATI, 3), at(RAJMA, 1), at(EGG_WHITE, 6), at(SALAD, 1)] },
  ],
}

export const NONVEG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [at(EGG, 3), at(OATS, 1)] },
    { key: 'lunch', items: [at(CHICKEN, 1), at(RICE, 1), at(CHAPATI, 2), at(SALAD, 1)] },
    { key: 'snack', items: [at(WHEY, 1)] },
    { key: 'dinner', items: [at(FISH, 1), at(MIXED_VEG, 1), at(CHAPATI, 2)] },
  ],
}
```

- [ ] **Step 4: Run the data test and the scaleDay suite**

Run: `npm test -- src/features/nutrition/sampleDayData.test.ts src/features/nutrition/scaleDay.test.ts`
Expected: PASS — tags present; scaleDay unaffected (the tags don't change base quantities).

- [ ] **Step 5: Commit**

```bash
git add src/features/nutrition/sampleDayData.ts src/features/nutrition/sampleDayData.test.ts
git commit -m "feat: tag sample foods with planner role/min/max/finisher"
```

---

## Task 3: Implement planDay (cut + bulk/maintain)

**Files:**
- Create: `src/features/nutrition/planDay.ts`
- Test: `src/features/nutrition/planDay.test.ts`

- [ ] **Step 1: Write the failing behavior tests**

Create `src/features/nutrition/planDay.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { planDay } from './planDay'
import type { DayTemplate } from './sampleDayData'

// chicken = lean lever (0.20 g/kcal), rice = filler (0.02), whey = capped finisher (0.25)
const T: DayTemplate = {
  meals: [{ key: 'lunch', items: [
    { name: 'chicken', perUnitCal: 100, perUnitProtein: 20, perUnitFat: 2, baseQty: 1, role: 'protein', min: 1, max: 4 },
    { name: 'rice', perUnitCal: 100, perUnitProtein: 2, perUnitFat: 0, baseQty: 2, role: 'filler', min: 0, max: 4 },
    { name: 'whey', perUnitCal: 100, perUnitProtein: 25, perUnitFat: 1, baseQty: 0, role: 'protein', min: 0, max: 3, finisher: true },
  ] }],
}
const item = (d: ReturnType<typeof planDay>, name: string) => d.meals[0].items.find((i) => i.name === name)!

describe('planDay — cut (calorie ceiling)', () => {
  it('never exceeds the calorie ceiling and reaches protein when the food set allows', () => {
    const d = planDay(T, { targetCalories: 500, targetProtein: 90, goal: 'cut' })
    expect(d.totalCal).toBeLessThanOrEqual(500)
    expect(d.totalProtein).toBeGreaterThanOrEqual(90)
  })
  it('maxes whole-food protein before using whey, and keeps whole food present (never whey-only)', () => {
    const d = planDay(T, { targetCalories: 500, targetProtein: 90, goal: 'cut' })
    expect(item(d, 'chicken').qty).toBe(4) // lean lever at its cap first
    expect(item(d, 'whey').qty).toBeGreaterThan(0) // whey only finishes the gap
    expect(item(d, 'chicken').qty).toBeGreaterThan(0)
  })
  it('trims low-protein filler to free calories for protein', () => {
    const d = planDay(T, { targetCalories: 500, targetProtein: 90, goal: 'cut' })
    expect(item(d, 'rice').qty).toBeLessThan(3) // phase-1 put rice at 3; funding protein trims it
  })
  it('accepts a shortfall rather than breaching the ceiling when protein is unreachable', () => {
    const d = planDay(T, { targetCalories: 300, targetProtein: 200, goal: 'cut' })
    expect(d.totalCal).toBeLessThanOrEqual(300)
    expect(d.totalProtein).toBeLessThan(200)
  })
})

describe('planDay — bulk/maintain (protein is the target)', () => {
  it('hits protein even when that pushes calories over the target', () => {
    // Same inputs where the cut version is ceiling-limited and falls short.
    const cut = planDay(T, { targetCalories: 250, targetProtein: 90, goal: 'cut' })
    const bulk = planDay(T, { targetCalories: 250, targetProtein: 90, goal: 'bulk' })
    expect(cut.totalProtein).toBeLessThan(90) // ceiling blocks the cut
    expect(bulk.totalProtein).toBeGreaterThanOrEqual(90) // bulk lets calories flex up
  })
  it('maintain behaves like bulk for the protein target', () => {
    const d = planDay(T, { targetCalories: 250, targetProtein: 90, goal: 'maintain' })
    expect(d.totalProtein).toBeGreaterThanOrEqual(90)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test -- src/features/nutrition/planDay.test.ts`
Expected: FAIL — `./planDay` does not exist yet.

- [ ] **Step 3: Implement planDay.ts**

Create `src/features/nutrition/planDay.ts`:

```ts
import type { Goal } from '../../domain/types'
import type { DayTemplate, MealItem } from './sampleDayData'
import { scaleToCalories, buildScaledDay, type Work, type ScaledDay } from './scaleDay'

export interface PlanInput { targetCalories: number; targetProtein: number; goal: Goal }

const ITER_CAP = 1000
const CAL_TOLERANCE = 50

const roleOf = (it: MealItem) => it.role ?? 'fixed'
const minOf = (it: MealItem) => it.min ?? 1
const maxOf = (it: MealItem) => it.max ?? Infinity
const isFinisher = (it: MealItem) => it.finisher ?? false
const density = (it: MealItem) => it.perUnitProtein / it.perUnitCal

/**
 * Phase 2: reconcile protein on top of a calorie-fit day.
 * - Cut: calories are a hard ceiling; add lean protein under it, trimming filler
 *   to free room, then finish with (capped) whey. A shortfall is accepted.
 * - Bulk/maintain: hit the protein target first (calories may flex up), then
 *   settle calories toward the target with filler.
 */
export function planDay(template: DayTemplate, { targetCalories, targetProtein, goal }: PlanInput): ScaledDay {
  const flat = scaleToCalories(template, targetCalories)
  const cal = () => flat.reduce((s, f) => s + f.qty * f.it.perUnitCal, 0)
  const protein = () => flat.reduce((s, f) => s + f.qty * f.it.perUnitProtein, 0)

  const wholeLeversBelowMax = () => flat.filter((f) => roleOf(f.it) === 'protein' && !isFinisher(f.it) && f.qty < maxOf(f.it))
  const wheyBelowMax = () => flat.filter((f) => isFinisher(f.it) && f.qty < maxOf(f.it))
  const trimmableFiller = () => flat.filter((f) => roleOf(f.it) === 'filler' && f.qty > minOf(f.it))
  const pick = (arr: Work[], dir: 1 | -1) =>
    arr.reduce<Work | null>((best, f) => (best === null || density(f.it) * dir > density(best.it) * dir ? f : best), null)

  if (goal === 'cut') {
    // Whole-food fill under the ceiling; trim lowest-density filler to make room.
    for (let i = 0; i < ITER_CAP && protein() < targetProtein; i++) {
      const below = wholeLeversBelowMax()
      if (below.length === 0) break // all whole-food levers maxed -> whey finisher
      const fits = below.filter((f) => cal() + f.it.perUnitCal <= targetCalories)
      if (fits.length > 0) { pick(fits, 1)!.qty += 1; continue } // add densest that fits
      const trim = trimmableFiller()
      if (trim.length === 0) break // no room can be freed
      pick(trim, -1)!.qty -= 1 // free calories from the lowest-density filler
    }
    // Whey finisher: still capped, still under the ceiling; trim filler for room.
    for (let i = 0; i < ITER_CAP && protein() < targetProtein; i++) {
      const whey = wheyBelowMax()
      if (whey.length === 0) break
      if (cal() + whey[0].it.perUnitCal <= targetCalories) { whey[0].qty += 1; continue }
      const trim = trimmableFiller()
      if (trim.length === 0) break
      pick(trim, -1)!.qty -= 1
    }
  } else {
    // Bulk/maintain: hit protein first (whole food, then whey), ceiling is soft.
    for (let i = 0; i < ITER_CAP && protein() < targetProtein; i++) {
      const below = wholeLeversBelowMax()
      if (below.length === 0) break
      pick(below, 1)!.qty += 1
    }
    for (let i = 0; i < ITER_CAP && protein() < targetProtein; i++) {
      const whey = wheyBelowMax()
      if (whey.length === 0) break
      whey[0].qty += 1
    }
    // Settle calories toward the target with filler, never dropping protein below target.
    for (let i = 0; i < ITER_CAP; i++) {
      const cur = cal()
      if (Math.abs(targetCalories - cur) <= CAL_TOLERANCE) break
      let best: { f: Work; d: 1 | -1; gap: number } | null = null
      for (const f of flat) {
        if (roleOf(f.it) !== 'filler') continue
        for (const d of [1, -1] as const) {
          if (d === 1 && f.qty >= maxOf(f.it)) continue
          if (d === -1 && f.qty <= minOf(f.it)) continue
          if (d === -1 && protein() - f.it.perUnitProtein < targetProtein) continue
          const g = Math.abs(targetCalories - (cur + d * f.it.perUnitCal))
          if (g < Math.abs(targetCalories - cur) && (best === null || g < best.gap)) best = { f, d, gap: g }
        }
      }
      if (best === null) break
      best.f.qty += best.d
    }
  }

  return buildScaledDay(template, flat)
}
```

- [ ] **Step 4: Run to confirm all planDay tests pass**

Run: `npm test -- src/features/nutrition/planDay.test.ts`
Expected: PASS — all cut and bulk/maintain cases green.

- [ ] **Step 5: Commit**

```bash
git add src/features/nutrition/planDay.ts src/features/nutrition/planDay.test.ts
git commit -m "feat: add protein-first planDay (cut ceiling, bulk/maintain flex-up)"
```

---

## Task 4: Wire NutritionPage to planDay

**Files:**
- Modify: `src/features/nutrition/NutritionPage.tsx`

- [ ] **Step 1: Swap the scaler import**

In `src/features/nutrition/NutritionPage.tsx`, change the import line:

```ts
import { scaleDay } from './scaleDay'
```

to:

```ts
import { planDay } from './planDay'
```

- [ ] **Step 2: Replace the scaleDay call**

Change the day computation (currently around line 34):

```ts
  const day = scaleDay(TEMPLATES[diet], target)
```

to:

```ts
  const day = planDay(TEMPLATES[diet], { targetCalories: target, targetProtein: macros.proteinG, goal: latestGoal.goal })
```

(`macros` and `latestGoal` are already in scope above this line — `macros` from `computeMacros(...)` and `latestGoal` from `useProfileData()`.)

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: `✓ built` with no TypeScript errors. (`latestGoal.goal` is a `Goal`, matching `PlanInput.goal`.)

- [ ] **Step 4: Commit**

```bash
git add src/features/nutrition/NutritionPage.tsx
git commit -m "feat: use protein-first planDay on the nutrition page"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all tests pass (previous 131 plus the new sampleDayData and planDay tests).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `✓ built`, no errors.

- [ ] **Step 3: Manual reconciliation sanity check**

Confirm by inspection of `planDay.test.ts` output / a scratch calc that, for the real `NONVEG_DAY` at a representative cut (e.g. target 2100 kcal, protein 200 g), `totalCal <= 2100` and `totalProtein` lands materially closer to 200 than the pre-change ~175 (whey should appear only after chicken/fish/egg are at their caps). Note any residual shortfall is expected per the design's accepted trade-off.

- [ ] **Step 4: Commit any notes (if applicable)**

No code change expected in this task; if scratch notes were added under `docs/`, commit them, otherwise skip.

---

## Self-Review

**Spec coverage:**
- Goal-dependent priority (cut ceiling / bulk-maintain flex) → Task 3 branches + Task 3 tests.
- Active rebalancing (trim filler to fund protein) → Task 3 cut loop + "trims filler" test.
- Whey as finisher only → Task 3 (whey excluded from whole-food loop; separate finisher loop) + "maxes whole-food before whey" test.
- Data model (role/min/max/finisher, defaults, backward compat) → Task 1 (defaults in scaleDay) + Task 2 (fields + tags) + Task 1 max-clamp test.
- Module boundaries (scaleToCalories / buildScaledDay / planDay / page wiring) → Tasks 1, 3, 4.
- Testing list from spec → Task 3 test file covers reachable/tight/rebalance/variety/bulk/degenerate-shortfall; Task 5 runs full suite for backward-compat.

**Placeholder scan:** none — every step has concrete code or an exact command with expected output.

**Type consistency:** `Work`, `ScaledDay`, `scaleToCalories`, `buildScaledDay` exported from `scaleDay.ts` and imported by `planDay.ts`; `PlanInput.goal: Goal` matches `latestGoal.goal`; `MealItem` optional tag fields consumed via `?? default` helpers in both `scaleDay.ts` and `planDay.ts`; food names in tests match those asserted.
