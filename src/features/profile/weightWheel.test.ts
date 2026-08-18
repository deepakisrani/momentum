import { describe, it, expect } from 'vitest'
import {
  buildWheelValues, indexOfNearest, valueAtScroll, scrollTopForIndex, stepValue,
  clampWeight, defaultAnchor, ROW_HEIGHT, WHEEL_MIN, WHEEL_MAX,
} from './weightWheel'

describe('buildWheelValues', () => {
  it('spans anchor +/- 15 in ascending 0.1 steps', () => {
    const v = buildWheelValues(78)
    expect(v[0]).toBe(63)
    expect(v[v.length - 1]).toBe(93)
    expect(v.length).toBe(301)
    // Not toBe: 63.1 - 63 === 0.10000000000000142 in raw float subtraction, even
    // though every stored value itself is exact (see the next test). Tightening
    // this to toBe would fail on the subtraction's own rounding, not the module's.
    expect(v[1] - v[0]).toBeCloseTo(0.1, 10)
  })

  it('holds exact one-decimal values with no float drift', () => {
    const v = buildWheelValues(78)
    // 78 - 15 = 63, so 78.1 sits at index 151.
    expect(v[151]).toBe(78.1)
    expect(v.every((n) => n === Math.round(n * 10) / 10)).toBe(true)
    expect(v.map(String).some((s) => s.includes('0000'))).toBe(false)
  })

  it('honours a custom span and step', () => {
    expect(buildWheelValues(50, { span: 0.2 })).toEqual([49.8, 49.9, 50, 50.1, 50.2])
    expect(buildWheelValues(50, { span: 2, step: 1 })).toEqual([48, 49, 50, 51, 52])
  })

  it('clamps to the global bounds, still returning a usable list', () => {
    const low = buildWheelValues(WHEEL_MIN + 1)
    expect(low[0]).toBe(WHEEL_MIN)
    const high = buildWheelValues(WHEEL_MAX - 1)
    expect(high[high.length - 1]).toBe(WHEEL_MAX)
    expect(low.length).toBeGreaterThan(1)
    expect(high.length).toBeGreaterThan(1)
  })
})

describe('indexOfNearest', () => {
  const values = [78, 78.1, 78.2, 78.3]
  it('finds an exact value', () => { expect(indexOfNearest(values, 78.2)).toBe(2) })
  it('finds the closest when between two values', () => { expect(indexOfNearest(values, 78.17)).toBe(2) })
  it('clamps below and above the list', () => {
    expect(indexOfNearest(values, 10)).toBe(0)
    expect(indexOfNearest(values, 400)).toBe(3)
  })
  it('is safe on an empty list', () => { expect(indexOfNearest([], 78)).toBe(0) })
})

describe('valueAtScroll', () => {
  const values = [78, 78.1, 78.2]
  it('maps a zero offset to the first value', () => {
    expect(valueAtScroll(0, ROW_HEIGHT, values)).toBe(78)
  })
  it('rounds to the nearest row', () => {
    expect(valueAtScroll(ROW_HEIGHT * 1.4, ROW_HEIGHT, values)).toBe(78.1)
    expect(valueAtScroll(ROW_HEIGHT * 1.6, ROW_HEIGHT, values)).toBe(78.2)
  })
  it('clamps overscroll at both ends', () => {
    expect(valueAtScroll(-500, ROW_HEIGHT, values)).toBe(78)
    expect(valueAtScroll(99999, ROW_HEIGHT, values)).toBe(78.2)
  })
})

describe('scrollTopForIndex', () => {
  it('round-trips with indexOfNearest', () => {
    const values = buildWheelValues(78)
    const top = scrollTopForIndex(indexOfNearest(values, 79.4), ROW_HEIGHT)
    expect(valueAtScroll(top, ROW_HEIGHT, values)).toBe(79.4)
  })
})

describe('stepValue', () => {
  const values = [78, 78.1, 78.2]
  it('steps up and down', () => {
    expect(stepValue(values, 1, 1)).toBe(78.2)
    expect(stepValue(values, 1, -1)).toBe(78)
  })
  it('clamps at both ends', () => {
    expect(stepValue(values, 0, -10)).toBe(78)
    expect(stepValue(values, 2, 10)).toBe(78.2)
  })
})

describe('clampWeight', () => {
  it('clamps to the global bounds', () => {
    expect(clampWeight(5)).toBe(WHEEL_MIN)
    expect(clampWeight(9999)).toBe(WHEEL_MAX)
    expect(clampWeight(78.4)).toBe(78.4)
  })
})

describe('degenerate inputs', () => {
  it('an anchor above WHEEL_MAX still yields a non-empty list within bounds', () => {
    const v = buildWheelValues(WHEEL_MAX + 100)
    expect(v.length).toBeGreaterThan(0)
    expect(v.every((n) => n >= WHEEL_MIN && n <= WHEEL_MAX)).toBe(true)
    expect(v[v.length - 1]).toBe(WHEEL_MAX)
  })

  it('an anchor below WHEEL_MIN still yields a non-empty list within bounds', () => {
    const v = buildWheelValues(WHEEL_MIN - 100)
    expect(v.length).toBeGreaterThan(0)
    expect(v.every((n) => n >= WHEEL_MIN && n <= WHEEL_MAX)).toBe(true)
    expect(v[0]).toBe(WHEEL_MIN)
  })

  it('a NaN anchor still yields a non-empty list within bounds', () => {
    const v = buildWheelValues(NaN)
    expect(v.length).toBeGreaterThan(0)
    expect(v.every((n) => n >= WHEEL_MIN && n <= WHEEL_MAX)).toBe(true)
  })

  it('valueAtScroll on an empty list returns WHEEL_MIN, not 0', () => {
    expect(valueAtScroll(0, ROW_HEIGHT, [])).toBe(WHEEL_MIN)
  })

  it('stepValue on an empty list returns WHEEL_MIN, not 0', () => {
    expect(stepValue([], 0, 1)).toBe(WHEEL_MIN)
  })

  it('a step of 0 returns an empty list and terminates', () => {
    expect(buildWheelValues(50, { step: 0 })).toEqual([])
  })

  it('a negative step also returns an empty list and terminates', () => {
    expect(buildWheelValues(50, { step: -1 })).toEqual([])
  })

  it('clampWeight(NaN) returns WHEEL_MIN', () => {
    expect(clampWeight(NaN)).toBe(WHEEL_MIN)
  })

  it('stepValue with a non-finite index does not return undefined', () => {
    const values = [78, 78.1, 78.2]
    expect(stepValue(values, NaN, 1)).toBe(78)
  })

  it('stepValue rounds a fractional index to a real row instead of returning undefined', () => {
    const values = [78, 78.1, 78.2, 78.3]
    expect(stepValue(values, 1.5, 0)).toBe(78.2)
  })

  it('stepValue rounds a fractional delta to a real row instead of returning undefined', () => {
    const values = [78, 78.1, 78.2, 78.3]
    expect(stepValue(values, 0, 0.5)).toBe(78.1)
  })

  it('stepValue and valueAtScroll agree on which end +/-Infinity clamps to', () => {
    const values = [78, 78.1, 78.2]
    expect(stepValue(values, Infinity, 1)).toBe(78.2)
    expect(stepValue(values, -Infinity, -1)).toBe(78)
  })
})

describe('defaultAnchor', () => {
  it('is a sensible starting weight per unit system', () => {
    expect(defaultAnchor('metric')).toBe(70)
    expect(defaultAnchor('imperial')).toBe(154)
  })
})
