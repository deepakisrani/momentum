import { describe, it, expect } from 'vitest'
import { linScale, linePath, smoothPath } from './chartScale'

describe('linScale', () => {
  it('maps domain to range linearly', () => {
    const s = linScale(0, 10, 0, 100)
    expect(s(0)).toBe(0); expect(s(5)).toBe(50); expect(s(10)).toBe(100)
  })
  it('maps a flat domain to the range minimum (no divide-by-zero)', () => {
    expect(linScale(5, 5, 0, 100)(5)).toBe(0)
  })
})

describe('linePath', () => {
  it('returns empty string for no points', () => { expect(linePath([])).toBe('') })
  it('emits a moveto for a single point', () => { expect(linePath([{ x: 1, y: 2 }])).toBe('M 1 2') })
  it('emits moveto + lineto for multiple points', () => {
    expect(linePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M 0 0 L 10 5')
  })
})

describe('smoothPath', () => {
  it('falls back to a straight line for fewer than 3 points', () => {
    expect(smoothPath([])).toBe('')
    expect(smoothPath([{ x: 1, y: 2 }])).toBe('M 1 2')
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M 0 0 L 10 5')
  })
  it('emits cubic-bezier segments for 3+ points', () => {
    const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }])
    expect(d.startsWith('M 0 0')).toBe(true)
    expect((d.match(/C /g) ?? []).length).toBe(2) // one curve per segment
  })
})
