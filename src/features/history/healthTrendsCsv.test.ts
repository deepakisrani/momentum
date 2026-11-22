import { describe, expect, it } from 'vitest'
import type { SleepSession } from '../../data/healthRepo'
import { healthTrendsCsv } from './healthTrendsCsv'

describe('health trends CSV', () => {
  it('counts workouts and recorded days, deduplicates overlapping sleep, and leaves missing averages blank', () => {
    const session: SleepSession = {
      record_id: 'night',
      source_package: 'watch',
      started_at: '2026-11-01T22:00:00Z',
      ended_at: '2026-11-02T06:00:00Z',
      start_offset_seconds: 0,
      end_offset_seconds: 0,
      stages: [
        { start: '2026-11-01T22:00:00Z', end: '2026-11-01T23:00:00Z', type: 1 },
        { start: '2026-11-01T23:00:00Z', end: '2026-11-02T06:00:00Z', type: 2 },
      ],
    }
    const csv = healthTrendsCsv([{
      firstDay: '2026-11-02',
      lastDay: '2026-11-09',
      workouts: ['2026-11-03T12:00:00Z', '2026-11-03T13:00:00Z'],
    }], {
      weights: [{ logged_on: '2026-11-02', weight_kg: 75 }],
      body: [],
      sleep: [
        session,
        { ...session, record_id: 'copy' },
        { ...session, record_id: 'other', source_package: 'other', started_at: '2026-11-02T02:00:00Z', stages: [] },
      ],
    })
    const [, first, second] = csv.split('\n')
    expect(first.split(',')).toEqual([
      '1', '1', '2026-11-02', '2026-11-08', '2', '75.00', '1',
      '', '0', '', '0', '480.00', '1', '420.00', '1',
    ])
    expect(second.split(',')).toEqual([
      '1', '2', '2026-11-09', '2026-11-09', '0', '', '0',
      '', '0', '', '0', '', '0', '', '0',
    ])
  })
})
