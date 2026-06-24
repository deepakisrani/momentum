import { describe, it, expect } from 'vitest'
import { relativeDate, formatDuration } from './historyFormat'

describe('relativeDate', () => {
  const now = new Date('2026-06-21T12:00:00')
  it('today', () => { expect(relativeDate('2026-06-21T08:00:00', now)).toEqual({ kind: 'today' }) })
  it('yesterday', () => { expect(relativeDate('2026-06-20T08:00:00', now)).toEqual({ kind: 'yesterday' }) })
  it('days ago', () => { expect(relativeDate('2026-06-18T08:00:00', now)).toEqual({ kind: 'daysAgo', n: 3 }) })
  it('one week ago', () => { expect(relativeDate('2026-06-11T08:00:00', now)).toEqual({ kind: 'weeksAgo', n: 1 }) })
  it('weeks ago', () => { expect(relativeDate('2026-05-31T08:00:00', now)).toEqual({ kind: 'weeksAgo', n: 3 }) })
})

describe('formatDuration', () => {
  it('hours and minutes', () => { expect(formatDuration('2026-06-21T10:00:00', '2026-06-21T11:12:00')).toBe('1h 12m') })
  it('minutes only', () => { expect(formatDuration('2026-06-21T10:00:00', '2026-06-21T10:45:00')).toBe('45m') })
  it('null end', () => { expect(formatDuration('2026-06-21T10:00:00', null)).toBeNull() })
})
