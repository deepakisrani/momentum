import { describe, it, expect } from 'vitest'
import { kgToLb, lbToKg, cmToIn, inToCm } from './units'

describe('units', () => {
  it('converts kg to lb and back', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 2)
    expect(lbToKg(220.462)).toBeCloseTo(100, 3)
  })
  it('converts cm to inches and back', () => {
    expect(cmToIn(180)).toBeCloseTo(70.866, 2)
    expect(inToCm(70.866)).toBeCloseTo(180, 2)
  })
  it('round-trips without drift', () => {
    expect(lbToKg(kgToLb(82.5))).toBeCloseTo(82.5, 6)
  })
})
