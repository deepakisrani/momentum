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
  it('holds the ceiling even when phase-1 overshoots and protein is already met', () => {
    // scaleToCalories(T, 250) lands at 300 (whole-unit granularity) and protein 24
    // already clears the low target, so the fill loops do not run. The ceiling
    // enforcement pass must trim filler back under 250.
    const d = planDay(T, { targetCalories: 250, targetProtein: 20, goal: 'cut' })
    expect(d.totalCal).toBeLessThanOrEqual(250)
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
