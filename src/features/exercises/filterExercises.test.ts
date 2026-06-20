import { describe, it, expect } from 'vitest'
import { filterExercises, distinctMuscleGroups, distinctEquipment } from './filterExercises'
import type { ExerciseRow } from '../../data/rows'

const ex = (over: Partial<ExerciseRow>): ExerciseRow => ({
  id: 'x', owner_user_id: null, name: 'Bench Press', muscle_group: 'chest',
  equipment: 'barbell', mechanic: 'compound', is_public: true, ...over,
})

const list: ExerciseRow[] = [
  ex({ id: '1', name: 'Bench Press', muscle_group: 'chest', equipment: 'barbell', mechanic: 'compound' }),
  ex({ id: '2', name: 'Incline DB Press', muscle_group: 'chest', equipment: 'dumbbell', mechanic: 'compound' }),
  ex({ id: '3', name: 'Bicep Curls', muscle_group: 'biceps', equipment: 'dumbbell', mechanic: 'isolation' }),
  ex({ id: '4', name: 'Leg Curl', muscle_group: 'hamstrings', equipment: 'machine', mechanic: 'isolation' }),
]

describe('filterExercises', () => {
  it('returns all when filters are empty/all', () => {
    expect(filterExercises(list, { query: '', muscleGroup: 'all', mechanic: 'all' })).toHaveLength(4)
  })
  it('matches name case-insensitively as a substring', () => {
    const r = filterExercises(list, { query: 'press', muscleGroup: 'all', mechanic: 'all' })
    expect(r.map((e) => e.id)).toEqual(['1', '2'])
  })
  it('filters by muscle group', () => {
    const r = filterExercises(list, { query: '', muscleGroup: 'chest', mechanic: 'all' })
    expect(r.map((e) => e.id)).toEqual(['1', '2'])
  })
  it('filters by mechanic', () => {
    const r = filterExercises(list, { query: '', muscleGroup: 'all', mechanic: 'isolation' })
    expect(r.map((e) => e.id)).toEqual(['3', '4'])
  })
  it('combines filters', () => {
    const r = filterExercises(list, { query: 'curl', muscleGroup: 'biceps', mechanic: 'isolation' })
    expect(r.map((e) => e.id)).toEqual(['3'])
  })
  it('includes null-mechanic exercises when mechanic is "all"', () => {
    const withNull = [...list, ex({ id: '6', mechanic: null })]
    expect(filterExercises(withNull, { query: '', muscleGroup: 'all', mechanic: 'all' })).toHaveLength(5)
  })
  it('excludes null-mechanic exercises when a specific mechanic is selected', () => {
    const withNull = [...list, ex({ id: '6', mechanic: null })]
    const r = filterExercises(withNull, { query: '', muscleGroup: 'all', mechanic: 'compound' })
    expect(r.find((e) => e.id === '6')).toBeUndefined()
  })
})

describe('distinct helpers', () => {
  it('returns sorted distinct muscle groups', () => {
    expect(distinctMuscleGroups(list)).toEqual(['biceps', 'chest', 'hamstrings'])
  })
  it('returns sorted distinct equipment, ignoring null', () => {
    expect(distinctEquipment([...list, ex({ id: '5', equipment: null })])).toEqual(['barbell', 'dumbbell', 'machine'])
  })
})
