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
