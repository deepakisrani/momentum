import { describe, it, expect } from 'vitest'
import { scaleDay } from './scaleDay'
import type { DayTemplate } from './sampleDayData'

const tpl: DayTemplate = {
  meals: [{ key: 'lunch', items: [{ name: 'x', perUnitCal: 100, perUnitProtein: 10, baseQty: 2 }] }],
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
  it('floors every item to at least 1 unit', () => {
    const d = scaleDay(tpl, 50)
    expect(d.meals[0].items[0].qty).toBe(1)
    expect(d.totalCal).toBe(100)
  })
})
