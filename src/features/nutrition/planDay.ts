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
    // Enforce the hard ceiling: phase-1's whole-unit fit can land slightly over
    // target, and if protein was already met the loops above never trimmed. Drop
    // low-density filler until under the ceiling (a protein dip is acceptable on a
    // cut). If no filler remains, a sub-item-sized overshoot is unavoidable.
    for (let i = 0; i < ITER_CAP && cal() > targetCalories; i++) {
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
