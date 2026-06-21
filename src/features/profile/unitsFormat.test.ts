import { describe, it, expect } from 'vitest'
import {
  weightUnitLabel,
  heightUnitLabel,
  toDisplayWeight,
  fromInputWeight,
  toDisplayHeight,
  fromInputHeight,
  formatWeight,
} from './unitsFormat'

describe('weightUnitLabel', () => {
  it('returns "lb" for imperial', () => {
    expect(weightUnitLabel('imperial')).toBe('lb')
  })
  it('returns "kg" for metric', () => {
    expect(weightUnitLabel('metric')).toBe('kg')
  })
})

describe('heightUnitLabel', () => {
  it('returns "in" for imperial', () => {
    expect(heightUnitLabel('imperial')).toBe('in')
  })
  it('returns "cm" for metric', () => {
    expect(heightUnitLabel('metric')).toBe('cm')
  })
})

describe('toDisplayWeight', () => {
  it('converts 100 kg to ~220.5 lb for imperial', () => {
    expect(toDisplayWeight(100, 'imperial')).toBeCloseTo(220.5, 0)
  })
  it('returns 82.5 kg as-is for metric', () => {
    expect(toDisplayWeight(82.5, 'metric')).toBe(82.5)
  })
})

describe('fromInputWeight', () => {
  it('converts 220.5 lb back to ~100 kg', () => {
    expect(fromInputWeight(220.5, 'imperial')).toBeCloseTo(100, 0)
  })
  it('returns metric value unchanged', () => {
    expect(fromInputWeight(82.5, 'metric')).toBe(82.5)
  })
})

describe('toDisplayWeight / fromInputWeight round-trip', () => {
  it('round-trips 85 kg within 0.2 kg for imperial', () => {
    const displayed = toDisplayWeight(85, 'imperial')
    const restored = fromInputWeight(displayed, 'imperial')
    expect(Math.abs(restored - 85)).toBeLessThanOrEqual(0.2)
  })
  it('round-trips 70 kg within 0.2 kg for metric', () => {
    const displayed = toDisplayWeight(70, 'metric')
    const restored = fromInputWeight(displayed, 'metric')
    expect(Math.abs(restored - 70)).toBeLessThanOrEqual(0.2)
  })
})

describe('toDisplayHeight', () => {
  it('converts 180 cm to ~70.9 in for imperial', () => {
    expect(toDisplayHeight(180, 'imperial')).toBeCloseTo(70.9, 0)
  })
  it('returns 180 cm as 180 for metric', () => {
    expect(toDisplayHeight(180, 'metric')).toBe(180)
  })
})

describe('fromInputHeight', () => {
  it('converts 70.9 in back to ~180 cm', () => {
    expect(fromInputHeight(70.9, 'imperial')).toBeCloseTo(180, 0)
  })
  it('returns metric value unchanged', () => {
    expect(fromInputHeight(180, 'metric')).toBe(180)
  })
})

describe('formatWeight', () => {
  it('formats metric: "60 kg"', () => {
    expect(formatWeight(60, 'metric')).toBe('60 kg')
  })
  it('formats imperial: "220.5 lb"', () => {
    expect(formatWeight(100, 'imperial')).toBe('220.5 lb')
  })
})
