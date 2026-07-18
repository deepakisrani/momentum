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
