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
