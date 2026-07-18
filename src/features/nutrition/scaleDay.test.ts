import { describe, it, expect } from 'vitest'
import { scaleDay } from './scaleDay'
import type { DayTemplate } from './sampleDayData'

const tpl: DayTemplate = {
  meals: [{ key: 'lunch', items: [{ name: 'x', perUnitCal: 100, perUnitProtein: 10, perUnitFat: 2, baseQty: 2 }] }],
}

describe('scaleDay', () => {
  it('scales quantities to the target and recomputes cal/protein', () => {
    const d = scaleDay(tpl, 400)
    expect(d.meals[0].items[0].qty).toBe(4)
    expect(d.meals[0].items[0].cal).toBe(400)
    expect(d.meals[0].items[0].protein).toBe(40)
    expect(d.totalCal).toBe(400)
    expect(d.totalProtein).toBe(40)
  })
  it('derives day fat and carbs from the final quantities', () => {
    // qty 4: fat 4*2=8g; carbs = (400 - 40*4 - 8*9)/4 = (400-160-72)/4 = 42g.
    const d = scaleDay(tpl, 400)
    expect(d.totalFat).toBe(8)
    expect(d.totalCarbs).toBe(42)
  })
  it('floors every item to at least 1 unit', () => {
    const d = scaleDay(tpl, 50)
    expect(d.meals[0].items[0].qty).toBe(1)
    expect(d.totalCal).toBe(100)
  })
  it('greedily closes the gap with whole units when rounding alone would fall short', () => {
    // base 110; factor 250/110≈2.27 rounds both to 2 → 220 (30 short).
    // Greedy adds the small 10-cal item until the day total hits the target exactly.
    const t: DayTemplate = {
      meals: [{ key: 'lunch', items: [
        { name: 'a', perUnitCal: 100, perUnitProtein: 20, perUnitFat: 2, baseQty: 1 },
        { name: 'b', perUnitCal: 10, perUnitProtein: 1, perUnitFat: 0, baseQty: 1 },
      ] }],
    }
    const d = scaleDay(t, 250)
    expect(d.totalCal).toBe(250)
    expect(d.meals[0].items[0].qty).toBe(2) // a
    expect(d.meals[0].items[1].qty).toBe(5) // b
  })
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
})
