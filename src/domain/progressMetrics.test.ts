import { describe, it, expect } from 'vitest'
import { epley1RM, summarizeSessions, type SetRow } from './progressMetrics'

describe('epley1RM', () => {
  it('equals the weight at 0 reps', () => { expect(epley1RM(100, 0)).toBeCloseTo(100) })
  it('applies the Epley factor', () => { expect(epley1RM(100, 10)).toBeCloseTo(133.333, 2) })
})

describe('summarizeSessions', () => {
  it('returns [] for no rows', () => { expect(summarizeSessions([])).toEqual([]) })

  it('groups by session (top-set 1RM, summed volume) sorted oldest first', () => {
    const rows: SetRow[] = [
      { sessionId: 's2', date: '2026-02-01T10:00:00Z', weight: 100, reps: 5 },
      { sessionId: 's1', date: '2026-01-01T10:00:00Z', weight: 80, reps: 8 },
      { sessionId: 's1', date: '2026-01-01T10:00:00Z', weight: 90, reps: 5 },
    ]
    const out = summarizeSessions(rows)
    expect(out.map((p) => p.date)).toEqual(['2026-01-01T10:00:00Z', '2026-02-01T10:00:00Z'])
    expect(out[0].e1rm).toBeCloseTo(105, 2)
    expect(out[0].volume).toBe(1090)
    expect(out[1].e1rm).toBeCloseTo(116.667, 2)
    expect(out[1].volume).toBe(500)
  })
})
