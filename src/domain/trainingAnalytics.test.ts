import { describe, expect, it } from 'vitest'
import { precedingWorkoutContext, recoveryMetrics, trainingMetrics, type AnalyticsWorkout } from './trainingAnalytics'

const set = (order: number, reps: number, rir: number | null, loadKg = 60) => ({
  order, segments: [{ loadKg, reps, rir }],
})

function workout(day: string, exerciseId: string, sets: ReturnType<typeof set>[], deload = false): AnalyticsWorkout {
  return {
    id: day, day, startedAt: day + 'T12:00:00Z', mesoId: 'meso', microcycleId: 'microcycle', deload,
    exercises: [{ id: exerciseId, name: 'Same display name', muscle: 'Back', sets }],
  }
}

describe('training analytics', () => {
  it('counts a drop set once while retaining all segments, misses unlogged RIR, and compares repeat loads', () => {
    const drop = set(3, 8, null)
    drop.segments.push({ loadKg: 40, reps: 5, rir: 0 })
    const output = trainingMetrics([
      workout('2026-11-02', 'row', [set(1, 12, 1), set(2, 9, 0), drop, set(4, 0, 0)]),
    ])
    expect(output.weeks[0]).toMatchObject({ workingSets: 3, rirSamples: 2, highEffortSets: 2, rirDistribution: { 0: 1, 1: 1 } })
    expect(output.sessions[0].exercises[0]).toMatchObject({
      loggedVolumeKgReps: 1940, withinSession: [{ repChange: -3, rirChange: -1 }],
    })
  })

  it('keeps substitutions and deloads out of the comparison baseline', () => {
    const output = trainingMetrics([
      workout('2026-11-06', 'row', [set(1, 12, 2)]),
      workout('2026-11-05', 'row', [set(1, 6, 2)], true),
      workout('2026-11-04', 'substitution', [set(1, 15, 2)]),
      workout('2026-11-03', 'row', [set(1, 11, null)]),
      workout('2026-11-02', 'row', [set(1, 10, 2)]),
    ])
    expect(output.matchedRepObservations.map((point) => [point.exerciseId, point.reps, point.previousReps]))
      .toEqual([['row', 10, null], ['substitution', 15, null], ['row', 12, 10]])
    expect(output.mesocycles[0]).toMatchObject({ workingSets: 5, deloadSets: 1 })
  })

  it('marks a reduced-volume week only when the comparison spans full weeks', () => {
    const output = trainingMetrics([
      ...['2026-11-02', '2026-11-09', '2026-11-16'].map((day) =>
        workout(day, 'row', [set(1, 10, 2), set(2, 10, 2), set(3, 10, 2)])),
      workout('2026-11-23', 'row', [set(1, 10, 2)]),
      workout('2026-11-30', 'row', [set(1, 10, 2)]),
    ], { from: '2026-11-02', through: '2026-12-01', reducedVolumeRatio: 0.7 })
    expect(output.weeks[3]).toMatchObject({ baselineWorkingSets: 3, workingSetChange: -2, reducedVolume: true })
    expect(output.weeks[4]).toMatchObject({ coveredDays: 2, workingSetChange: null, reducedVolume: null })
  })
})

describe('recovery analytics', () => {
  it('excludes same-day and future daily aggregates from workout context', () => {
    const context = precedingWorkoutContext(workout('2026-11-06', 'row', []), [
      { day: '2026-11-04', sleepMinutes: 400 }, { day: '2026-11-05', sleepMinutes: 440 },
      { day: '2026-11-06', sleepMinutes: 800 }, { day: '2026-11-07', sleepMinutes: 800 },
    ])
    expect(context).toMatchObject({ value: 420, sampleSize: 2, range: { from: '2026-11-03', through: '2026-11-05' } })
  })
  it('distinguishes zero steps from missing data and shows coverage on both sides of a comparison', () => {
    const output = recoveryMetrics([
      { day: '2026-11-06', sleepMinutes: 360, steps: 0 },
      { day: '2026-11-05', sleepMinutes: 480 },
      { day: '2026-11-02', sleepMinutes: 460 },
      { day: '2026-11-07', sleepMinutes: 999, steps: 1000 },
    ], '2026-11-06', { windows: [3], sleepTargetMinutes: 480 })
    const metric = (id: string) => output.find((entry) => entry.id === id)
    expect(metric('sleep.mean_minutes')).toMatchObject({ value: 420, baseline: 460, change: -40, sampleSize: 2, baselineSampleSize: 1 })
    expect(metric('sleep.shortfall_minutes')).toMatchObject({ value: 120, change: null })
    expect(metric('steps.mean_count')).toMatchObject({ value: 0, coverage: 1 / 3 })
    expect(metric('resting_heart_rate.median_bpm')).toMatchObject({ value: null, status: 'insufficient_data' })
  })
})
