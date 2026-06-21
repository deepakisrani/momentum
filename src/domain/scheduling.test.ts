import { describe, it, expect } from 'vitest'
import {
  isScheduledDeload,
  shouldDeload,
  nextDeloadDebt,
  remainingSlate,
  startOfWeek,
  hasWeekRolledOver,
  nextInRotation,
  sessionsSinceLastDeload,
  isDeloadDue,
} from './scheduling'

describe('deload cadence + debt', () => {
  it('flags every Nth microcycle as a scheduled deload', () => {
    expect(isScheduledDeload(5, 5)).toBe(true)
    expect(isScheduledDeload(10, 5)).toBe(true)
    expect(isScheduledDeload(4, 5)).toBe(false)
    expect(isScheduledDeload(3, null)).toBe(false)
    expect(isScheduledDeload(3, 0)).toBe(false)
  })
  it('deloads when scheduled OR debt is carried', () => {
    expect(shouldDeload(4, 5, false)).toBe(false)
    expect(shouldDeload(4, 5, true)).toBe(true)
    expect(shouldDeload(5, 5, false)).toBe(true)
  })
  it('owes a deload only when one was due but not performed', () => {
    expect(nextDeloadDebt(true, false)).toBe(true)
    expect(nextDeloadDebt(true, true)).toBe(false)
    expect(nextDeloadDebt(false, false)).toBe(false)
  })
  it('treats a non-positive microcycle number as not a deload (1-based)', () => {
    expect(isScheduledDeload(0, 5)).toBe(false)
    expect(shouldDeload(0, 5, false)).toBe(false)
  })
})

describe('calendar-week slate', () => {
  it('returns day-types not yet completed this week, preserving order', () => {
    expect(remainingSlate(['push', 'pull', 'legs', 'arms'], ['pull', 'arms'])).toEqual(['push', 'legs'])
    expect(remainingSlate(['push', 'pull'], [])).toEqual(['push', 'pull'])
    expect(remainingSlate(['push', 'pull'], ['push', 'pull'])).toEqual([])
  })
  it('computes start of week for a given week-start day', () => {
    expect(startOfWeek(new Date(2026, 5, 20), 1)).toEqual(new Date(2026, 5, 15))
    expect(startOfWeek(new Date(2026, 5, 20), 0)).toEqual(new Date(2026, 5, 14))
  })
  it('detects when now is in a later week than the tracked week start', () => {
    const weekStart = new Date(2026, 5, 15)
    expect(hasWeekRolledOver(weekStart, new Date(2026, 5, 19), 1)).toBe(false)
    expect(hasWeekRolledOver(weekStart, new Date(2026, 5, 22), 1)).toBe(true)
  })
  it('startOfWeek handles month and year boundaries', () => {
    // Wed Jul 1 2026, Mon start -> Mon Jun 29 2026
    expect(startOfWeek(new Date(2026, 6, 1), 1)).toEqual(new Date(2026, 5, 29))
    // Thu Jan 1 2026, Mon start -> Mon Dec 29 2025
    expect(startOfWeek(new Date(2026, 0, 1), 1)).toEqual(new Date(2025, 11, 29))
  })
  it('does not consider an earlier week as a rollover', () => {
    const weekStart = new Date(2026, 5, 15)
    expect(hasWeekRolledOver(weekStart, new Date(2026, 5, 8), 1)).toBe(false)
  })
})

describe('continuous rotation', () => {
  it('returns the next day-type by completed count, wrapping around', () => {
    const rot = ['push', 'pull', 'legs']
    expect(nextInRotation(rot, 0)).toBe('push')
    expect(nextInRotation(rot, 2)).toBe('legs')
    expect(nextInRotation(rot, 3)).toBe('push')
    expect(nextInRotation([], 0)).toBeNull()
  })
})

describe('sessionsSinceLastDeload', () => {
  const w = { isDeload: false }
  const d = { isDeload: true }
  it('counts all when there has never been a deload', () => {
    expect(sessionsSinceLastDeload([w, w, w])).toBe(3)
    expect(sessionsSinceLastDeload([])).toBe(0)
  })
  it('counts only sessions since the most recent deload (newest-first input)', () => {
    expect(sessionsSinceLastDeload([w, w, d, w])).toBe(2)
  })
  it('is 0 when the most recent session was a deload', () => {
    expect(sessionsSinceLastDeload([d, w, w])).toBe(0)
  })
})

describe('isDeloadDue', () => {
  it('is false when N is null or non-positive', () => {
    expect(isDeloadDue(10, null)).toBe(false)
    expect(isDeloadDue(10, 0)).toBe(false)
  })
  it('fires on the Nth session (4 done since last deload, starting the 5th, N=5)', () => {
    expect(isDeloadDue(4, 5)).toBe(true)
    expect(isDeloadDue(3, 5)).toBe(false)
  })
  it('carries forward: if overridden, stays due past N (5 since last deload, N=5)', () => {
    expect(isDeloadDue(5, 5)).toBe(true)
    expect(isDeloadDue(8, 5)).toBe(true)
  })
  it('resets after an actual deload (0 since, N=5)', () => {
    expect(isDeloadDue(0, 5)).toBe(false)
  })
})
