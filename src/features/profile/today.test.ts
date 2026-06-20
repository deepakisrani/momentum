import { describe, it, expect } from 'vitest'
import { todayIso } from './today'

describe('todayIso', () => {
  it('formats a local date as YYYY-MM-DD with zero-padding', () => {
    expect(todayIso(new Date(2026, 5, 20))).toBe('2026-06-20')
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
