import { describe, it, expect } from 'vitest'
import { blankMeso, draftFromFull, stripIds, validateMeso, moveItem, type MesoFull } from './mesoDraft'

describe('blankMeso', () => {
  it('starts calendar-week, deload every 5, no days', () => {
    expect(blankMeso()).toEqual({ name: '', schedulingStyle: 'calendar_week', deloadEveryN: 5, days: [] })
  })
})

const full: MesoFull = {
  meso: { id: 'm1', user_id: 'u1', name: 'June', scheduling_style: 'continuous', deload_every_n_microcycles: 4, is_active: true, notes: null, created_at: '2026-06-20T00:00:00Z' },
  days: [
    { id: 'd1', meso_id: 'm1', label: 'Push', order_index: 0, exercises: [
      { id: 'e1', meso_day_id: 'd1', exercise_id: 'ex1', order_index: 0, target_sets: 3, rep_min: 8, rep_max: 12 },
    ] },
  ],
}

describe('draftFromFull / stripIds', () => {
  it('maps DB rows to a draft preserving ids', () => {
    const d = draftFromFull(full)
    expect(d).toEqual({
      id: 'm1', name: 'June', schedulingStyle: 'continuous', deloadEveryN: 4,
      days: [{ id: 'd1', label: 'Push', exercises: [{ id: 'e1', exerciseId: 'ex1', targetSets: 3, repMin: 8, repMax: 12 }] }],
    })
  })
  it('stripIds removes all ids for duplication', () => {
    const d = stripIds(draftFromFull(full))
    expect(d.id).toBeUndefined()
    expect(d.days[0].id).toBeUndefined()
    expect(d.days[0].exercises[0].id).toBeUndefined()
    expect(d.name).toBe('June')
  })
})

describe('validateMeso', () => {
  const base = () => ({ name: 'X', schedulingStyle: 'calendar_week' as const, deloadEveryN: 5, days: [{ label: 'Push', exercises: [{ exerciseId: 'ex1', targetSets: 3, repMin: 8, repMax: 12 }] }] })
  it('passes a valid draft', () => {
    expect(validateMeso(base())).toEqual([])
  })
  it('flags a missing name and zero days', () => {
    expect(validateMeso({ name: ' ', schedulingStyle: 'calendar_week', deloadEveryN: 5, days: [] })).toEqual(['name', 'days'])
  })
  it('flags a blank day label, inverted rep range, and zero sets', () => {
    const d = base()
    d.days[0].label = ''
    d.days[0].exercises[0] = { exerciseId: 'ex1', targetSets: 0, repMin: 12, repMax: 8 }
    expect(validateMeso(d)).toEqual(['day.0.label', 'day.0.ex.0.range', 'day.0.ex.0.sets'])
  })
})

describe('moveItem', () => {
  it('swaps an item with its neighbor', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
  })
  it('is a no-op at the edges', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
})
