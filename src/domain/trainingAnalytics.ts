export const ANALYTICS_VERSION = '2.0.0'
const DAY = 86_400_000

export interface AnalyticsDay {
  day: string
  sleepMinutes?: number
  weightKg?: number
  averageHeartRate?: number
  steps?: number
}

export interface AnalyticsWorkout {
  id: string
  day: string
  startedAt: string
  mesoId: string | null
  microcycleId: string | null
  deload: boolean
  exercises: {
    id: string
    name: string
    muscle: string | null
    sets: { order: number; segments: { loadKg: number; reps: number; rir: number | null }[] }[]
  }[]
}

export function calendarDate(day: string, offset: number) {
  return new Date(Date.parse(day) + offset * DAY).toISOString().slice(0, 10)
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function weekOf(day: string) {
  return calendarDate(day, -((new Date(day).getUTCDay() + 6) % 7))
}

export function precedingWorkoutContext(workout: AnalyticsWorkout, days: AnalyticsDay[]) {
  const byDay = new Map(days.map((day) => [day.day, day]))
  const from = calendarDate(workout.day, -3)
  const through = calendarDate(workout.day, -1)
  const observations = [from, calendarDate(from, 1), through].flatMap((day) => {
    const value = byDay.get(day)?.sleepMinutes
    return typeof value === 'number' && Number.isFinite(value) ? [{ day, minutes: value }] : []
  })
  return {
    id: 'workout.prior_three_days_sleep_minutes', version: ANALYTICS_VERSION,
    sessionId: workout.id, workoutStartedAt: workout.startedAt, range: { from, through },
    method: 'Mean observed minutes asleep from the three completed calendar days before the workout date, using sleep sessions that ended before the workout started.',
    value: observations.length ? average(observations.map((item) => item.minutes)) : null,
    sampleSize: observations.length, coverage: observations.length / 3, observations,
  }
}

export function recoveryMetrics(
  days: AnalyticsDay[], through: string, config: { windows: number[]; sleepTargetMinutes: number },
) {
  const byDay = new Map(days.map((day) => [day.day, day]))
  function observations(end: string, length: number, field: Exclude<keyof AnalyticsDay, 'day'>) {
    return Array.from({ length }, (_, index) => {
      const day = calendarDate(end, index + 1 - length)
      const value = byDay.get(day)?.[field]
      return typeof value === 'number' && Number.isFinite(value) ? { day, value } : null
    }).filter((item) => item !== null)
  }
  return config.windows.flatMap((windowDays) => {
    const baselineEnd = calendarDate(through, -windowDays)
    const sleep = observations(through, windowDays, 'sleepMinutes')
    const descriptors = [
      { id: 'sleep.mean_minutes', field: 'sleepMinutes', compute: average, method: 'Mean minutes asleep across observed days' },
      { id: 'sleep.consistency_sd_minutes', field: 'sleepMinutes', minimum: 2, compute: (values: number[]) => {
        const center = average(values)
        return Math.sqrt(average(values.map((value) => (value - center) ** 2)))
      }, method: 'Population standard deviation of observed sleep duration' },
      { id: 'sleep.shortfall_minutes', field: 'sleepMinutes',
        compute: (values: number[]) => values.reduce((sum, value) => sum + Math.max(0, config.sleepTargetMinutes - value), 0),
        method: `Sum of nightly shortfalls against ${config.sleepTargetMinutes} minutes across observed nights` },
      { id: 'weight.mean_kg', field: 'weightKg', compute: average, method: 'Mean of observed daily weights' },
      { id: 'steps.mean_count', field: 'steps', compute: average, method: 'Mean of observed daily step totals' },
      { id: 'heart_rate.mean_daily_bpm', field: 'averageHeartRate', compute: average, method: 'Mean of observed daily heart-rate averages, with each observed day weighted equally' },
    ] as const
    return descriptors.map((metric) => {
      const values = metric.field === 'sleepMinutes' ? sleep : observations(through, windowDays, metric.field)
      const baselineValues = observations(baselineEnd, windowDays, metric.field)
      const minimum = 'minimum' in metric ? metric.minimum : 1
      const value = values.length >= minimum ? metric.compute(values.map((item) => item.value)) : null
      const baseline = baselineValues.length >= minimum ? metric.compute(baselineValues.map((item) => item.value)) : null
      const comparable = metric.id !== 'sleep.shortfall_minutes' || (
        values.length === windowDays && baselineValues.length === windowDays
      )
      return {
        id: metric.id, version: ANALYTICS_VERSION, windowDays, value, baseline,
        change: comparable && value !== null && baseline !== null ? value - baseline : null,
        range: { from: calendarDate(baselineEnd, 1), through },
        baselineRange: { from: calendarDate(baselineEnd, 1 - windowDays), through: baselineEnd },
        sampleSize: values.length, baselineSampleSize: baselineValues.length, coverage: values.length / windowDays,
        status: value === null ? 'insufficient_data' : 'observed',
        method: metric.method, observations: values, baselineObservations: baselineValues,
      }
    })
  })
}

interface MatchedSet {
  exerciseId: string
  name: string
  sessionId: string
  day: string
  loadKg: number
  reps: number
  rir: number
  previousReps: number | null
  previousSessionId: string | null
}

export function trainingMetrics(
  workouts: AnalyticsWorkout[],
  range?: { from: string; through: string; reducedVolumeRatio: number },
) {
  const sessions = [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id)).map((workout) => {
    const exercises = workout.exercises.map((exercise) => {
      const sets = [...exercise.sets].sort((a, b) => a.order - b.order)
        .map((set) => ({ ...set, segments: set.segments.filter((segment) => segment.reps > 0) }))
        .filter((set) => set.segments.length > 0)
      const firstSegmentRirs = sets.map((set) => set.segments[0].rir)
      const byLoad = new Map<number, { reps: number; rir: number | null; setOrder: number }[]>()
      for (const set of sets) {
        if (set.segments.length !== 1) continue
        const segment = set.segments[0]
        const observations = byLoad.get(segment.loadKg) ?? []
        observations.push({ reps: segment.reps, rir: segment.rir, setOrder: set.order })
        byLoad.set(segment.loadKg, observations)
      }
      return {
        id: exercise.id, name: exercise.name, muscle: exercise.muscle,
        workingSets: sets.length,
        loggedVolumeKgReps: sets.reduce((total, set) =>
          total + set.segments.reduce((sum, segment) => sum + segment.loadKg * segment.reps, 0), 0),
        rirSamples: firstSegmentRirs.filter((rir) => rir !== null).length,
        highEffortSets: firstSegmentRirs.filter((rir) => rir === 0 || rir === 1).length,
        withinSession: [...byLoad.entries()].filter(([, rows]) => rows.length >= 2).map(([loadKg, rows]) => {
          const first = rows[0]
          const last = rows[rows.length - 1]
          return { loadKg, first, last, repChange: last.reps - first.reps,
            rirChange: first.rir !== null && last.rir !== null ? last.rir - first.rir : null }
        }),
        sets,
      }
    })
    return { ...workout, exercises, workingSets: exercises.reduce((total, exercise) => total + exercise.workingSets, 0) }
  })
  const weeks = new Map<string, typeof sessions>()
  if (range) {
    for (let week = weekOf(range.from); week <= range.through; week = calendarDate(week, 7)) weeks.set(week, [])
  }
  const mesocycles = new Map<string | null, { mesoId: string | null; sessions: number; workingSets: number; deloadSets: number }>()
  for (const session of sessions) {
    const week = weekOf(session.day)
    const existing = weeks.get(week) ?? []
    existing.push(session)
    weeks.set(week, existing)
    const meso = mesocycles.get(session.mesoId) ?? { mesoId: session.mesoId, sessions: 0, workingSets: 0, deloadSets: 0 }
    meso.sessions++
    meso.workingSets += session.workingSets
    if (session.deload) meso.deloadSets += session.workingSets
    mesocycles.set(session.mesoId, meso)
  }
  const performance = new Map<string, MatchedSet>()
  const comparisons: MatchedSet[] = []
  for (const session of sessions) {
    if (session.deload) continue
    const sameSession = new Map<string, MatchedSet>()
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        const segment = set.segments[0]
        if (set.segments.length !== 1 || segment.rir === null) continue
        const key = JSON.stringify([exercise.id, segment.loadKg, segment.rir])
        if (sameSession.has(key)) continue
        const previous = performance.get(key)
        const row = {
          exerciseId: exercise.id, name: exercise.name, sessionId: session.id, day: session.day,
          loadKg: segment.loadKg, reps: segment.reps, rir: segment.rir,
          previousReps: previous?.reps ?? null, previousSessionId: previous?.sessionId ?? null,
        }
        sameSession.set(key, row)
        comparisons.push(row)
      }
    }
    for (const [key, row] of sameSession) performance.set(key, row)
  }
  const summaries = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, group]) => {
    const exercises = group.flatMap((session) => session.exercises)
    const muscleSets = new Map<string, number>()
    const rirDistribution = new Map<number, number>()
    for (const exercise of exercises) {
      if (exercise.muscle) muscleSets.set(exercise.muscle, (muscleSets.get(exercise.muscle) ?? 0) + exercise.workingSets)
      for (const set of exercise.sets) {
        const rir = set.segments[0].rir
        if (rir !== null) rirDistribution.set(rir, (rirDistribution.get(rir) ?? 0) + 1)
      }
    }
    return {
      week, coveredDays: range ? 1 + (Date.parse(calendarDate(week, 6) > range.through ? range.through : calendarDate(week, 6)) -
        Date.parse(week < range.from ? range.from : week)) / DAY : null,
      sessions: group.length, deloadSessions: group.filter((session) => session.deload).length,
      workingSets: group.reduce((total, session) => total + session.workingSets, 0),
      byExercise: exercises.reduce<Record<string, { workingSets: number; loggedVolumeKgReps: number }>>((totals, exercise) => {
        const total = totals[exercise.id] ?? { workingSets: 0, loggedVolumeKgReps: 0 }
        total.workingSets += exercise.workingSets
        total.loggedVolumeKgReps += exercise.loggedVolumeKgReps
        totals[exercise.id] = total
        return totals
      }, {}),
      primaryMuscleSets: Object.fromEntries(muscleSets),
      rirDistribution: Object.fromEntries(rirDistribution),
      rirSamples: exercises.reduce((total, exercise) => total + exercise.rirSamples, 0),
      highEffortSets: exercises.reduce((total, exercise) => total + exercise.highEffortSets, 0),
    }
  })
  return {
    version: ANALYTICS_VERSION,
    methods: {
      workingSets: 'Count each logged set with positive reps once. Warm-up status is unavailable.',
      loggedVolume: 'Sum recorded load × reps across positive-rep segments. Compare within the same exercise and setup.',
      rir: 'Count the first recorded segment of each working set. Missing RIR reduces coverage.',
      weeks: 'Monday-start calendar weeks in the selected reporting time zone. Edge weeks can be partial.',
      matchedReps: 'First straight set at each exact exercise ID, recorded load and RIR compared with the previous matching non-deload session. Assumes the same setup.',
      reducedVolume: 'Complete training week with at least one session and working sets below the configured fraction of the prior three complete weeks’ median.',
    },
    sessions,
    mesocycles: [...mesocycles.values()],
    matchedRepObservations: comparisons,
    weeks: summaries.map((week, index) => {
      const previous = summaries.slice(Math.max(0, index - 3), index)
      const baseline = previous.length === 3 && previous.every((item) => item.coveredDays === 7)
        ? median(previous.map((item) => item.workingSets)) : null
      const comparable = week.coveredDays === 7 && baseline !== null && baseline > 0
      return {
        ...week, baselineWorkingSets: baseline,
        workingSetChange: comparable ? week.workingSets - baseline : null,
        reducedVolume: comparable && range && week.sessions > 0
          ? week.workingSets < baseline * range.reducedVolumeRatio : null,
      }
    }),
  }
}
