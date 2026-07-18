import { describe, it, expect } from 'vitest'
import { computeMacros } from './macros'

describe('computeMacros', () => {
  it('maintain: 2.0 g/kg protein, 25% fat, carbs remainder', () => {
    const m = computeMacros(2000, 80, 'maintain')
    expect(m.proteinG).toBe(160)
    expect(m.fatG).toBe(56)
    expect(m.carbG).toBe(215)
  })
  it('cut uses 2.2 g/kg', () => {
    expect(computeMacros(2000, 80, 'cut').proteinG).toBe(176)
  })
  it('honors a protein/kg override', () => {
    expect(computeMacros(2000, 80, 'maintain', 1.6).proteinG).toBe(128)
  })
  it('clamps carbs to 0 when protein+fat already exceed the target', () => {
    expect(computeMacros(1000, 120, 'cut').carbG).toBe(0)
  })
})
