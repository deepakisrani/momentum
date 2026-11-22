import { describe, expect, it } from 'vitest'
import type { SleepSession } from '../../data/healthRepo'
import { dailyHealthCsv } from './dailyHealthCsv'

describe('daily health CSV', () => {
  it('keeps rest days, deduplicates overlapping sleep, preserves zero, and leaves missing readings blank', () => {
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
    const csv = dailyHealthCsv([{ firstDay: '2026-11-02', lastDay: '2026-11-03' }], {
      weights: [{ logged_on: '2026-11-02', weight_kg: 75 }],
      body: [],
      daily: [
        { day: '2026-11-02', metric: 'steps', value: 0 },
        { day: '2026-11-02', metric: 'heart_rate', value: 76 },
      ],
      sleep: [
        session,
        { ...session, record_id: 'copy' },
        { ...session, record_id: 'other', source_package: 'other', started_at: '2026-11-02T02:00:00Z', stages: [] },
      ],
    }, { rows: [{
      sessionId: 'workout', date: '2026-11-03T12:00:00', dayLabel: 'Pull', isDeload: false,
      exercise: 'Row', muscleGroup: 'Back', setNumber: 1, weightKg: 40, reps: 10, rir: 2,
    }], sessions: [{
      id: 'workout', started_at: '2026-11-03T12:00:00', is_deload: false,
      meso_day_id: null, meso_day: null, session_exercise: [],
    }, {
      id: 'second-workout', started_at: '2026-11-03T18:00:00', is_deload: false,
      meso_day_id: null, meso_day: null, session_exercise: [],
    }] }, 'lb', (kg) => kg * 2)
    const [header, first, second] = csv.split('\n')
    expect(header).toContain('average_heart_rate_bpm')
    expect(header).not.toContain('resting_heart_rate_bpm')
    expect(first).toBe('2026-11-02,75,,,480.00,420.00,0,76,0,')
    expect(second).toContain('2026-11-03,,,,,,,,2,')
    const workouts = JSON.parse(second.replace(/^[^"]*"/, '').slice(0, -1).replace(/""/g, '"'))
    expect(workouts[0].sets).toEqual([{ exercise: 'Row', muscle_group: 'Back', set: 1, weight: 80, weight_unit: 'lb', reps: 10, rir: 2 }])
    expect(workouts[1].sets).toEqual([])
  })
})
