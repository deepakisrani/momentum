import type { DayTemplate, MealItem } from './sampleDayData'

export interface ScaledItem { name: string; qty: number; cal: number; protein: number }
export interface ScaledMeal { key: string; items: ScaledItem[]; cal: number; protein: number }
export interface ScaledDay { meals: ScaledMeal[]; totalCal: number; totalProtein: number }

interface Work { mi: number; ii: number; it: MealItem; qty: number }

/**
 * Scale a template's portions to `targetCalories` in WHOLE units (min 1 each).
 * A first pass rounds `baseQty * factor`; a greedy pass then adds/removes single
 * units — taking whichever move most reduces the gap — so the day total lands as
 * close to the target as integer portions allow (rounding alone is too coarse at
 * factors near 1). Per-item cal/protein are recomputed from the final quantities.
 */
export function scaleDay(template: DayTemplate, targetCalories: number): ScaledDay {
  const flat: Work[] = template.meals.flatMap((m, mi) => m.items.map((it, ii) => ({ mi, ii, it, qty: 0 })))
  const base = flat.reduce((s, f) => s + f.it.baseQty * f.it.perUnitCal, 0)
  const factor = base > 0 ? targetCalories / base : 1
  for (const f of flat) f.qty = Math.max(1, Math.round(f.it.baseQty * factor))

  const total = () => flat.reduce((s, f) => s + f.qty * f.it.perUnitCal, 0)

  // Greedy gap-closing: repeatedly apply the single ±1-unit move that best
  // reduces |target - total|; stop when no move improves.
  for (;;) {
    const cur = total()
    const gap = Math.abs(targetCalories - cur)
    let best: { f: Work; delta: number; gap: number } | null = null
    for (const f of flat) {
      for (const delta of [1, -1] as const) {
        if (delta === -1 && f.qty <= 1) continue
        const g = Math.abs(targetCalories - (cur + delta * f.it.perUnitCal))
        if (g < gap && (best === null || g < best.gap)) best = { f, delta, gap: g }
      }
    }
    if (best === null) break
    best.f.qty += best.delta
  }

  const qtyOf = (mi: number, ii: number) => flat.find((f) => f.mi === mi && f.ii === ii)!.qty
  const meals: ScaledMeal[] = template.meals.map((m, mi) => {
    const items = m.items.map((it, ii) => {
      const qty = qtyOf(mi, ii)
      return { name: it.name, qty, cal: qty * it.perUnitCal, protein: qty * it.perUnitProtein }
    })
    return { key: m.key, items, cal: items.reduce((s, i) => s + i.cal, 0), protein: items.reduce((s, i) => s + i.protein, 0) }
  })
  return { meals, totalCal: meals.reduce((s, m) => s + m.cal, 0), totalProtein: meals.reduce((s, m) => s + m.protein, 0) }
}
