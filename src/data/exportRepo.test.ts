import { describe, it, expect } from 'vitest'
import { flattenMesoQuery, type QSession } from './exportRepo'

const sessions: QSession[] = [
  {
    started_at: '2026-07-10T06:00:00Z', is_deload: false, meso_day_id: 'd1',
    meso_day: { label: 'Push' },
    session_exercise: [
      {
        order_index: 1,
        exercise: { name: 'Bench, incline', muscle_group: 'chest' },
        logged_set: [
          { set_index: 0, set_segment: [{ segment_index: 0, weight: 60, reps: 8, rir: 2 }] },
          { set_index: 1, set_segment: [{ segment_index: 0, weight: 60, reps: 7, rir: null }] },
        ],
      },
      { order_index: 0, exercise: { name: 'Empty', muscle_group: 'x' }, logged_set: [] },
    ],
  },
  {
    started_at: '2026-07-08T06:00:00Z', is_deload: true, meso_day_id: null,
    meso_day: null,
    session_exercise: [
      { order_index: 0, exercise: null, logged_set: [{ set_index: 0, set_segment: [{ segment_index: 0, weight: 40, reps: 10, rir: 3 }] }] },
    ],
  },
]

describe('flattenMesoQuery', () => {
  it('flattens to sorted rows, resolving labels/names and numbering sets 1-based', () => {
    const rows = flattenMesoQuery(sessions)
    expect(rows.map((r) => r.date)).toEqual([
      '2026-07-08T06:00:00Z', '2026-07-10T06:00:00Z', '2026-07-10T06:00:00Z',
    ])
    expect(rows[0]).toEqual({
      date: '2026-07-08T06:00:00Z', dayLabel: null, isDeload: true, exercise: '',
      muscleGroup: null, setNumber: 1, weightKg: 40, reps: 10, rir: 3,
    })
    expect(rows[1].exercise).toBe('Bench, incline')
    expect(rows[1].dayLabel).toBe('Push')
    expect(rows[1].setNumber).toBe(1)
    expect(rows[2].setNumber).toBe(2)
    expect(rows[2].rir).toBeNull()
  })
  it('returns an empty array for no sessions', () => {
    expect(flattenMesoQuery([])).toEqual([])
  })
})
