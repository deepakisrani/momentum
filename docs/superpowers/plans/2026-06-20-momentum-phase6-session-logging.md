# Momentum Phase 6 — Session Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log a workout — start/end timer, the active meso's day as a non-linear checklist, per-set weight/reps/optional RIR, a "last time" reference, and Set-1 prefill driven by the suggestion engine — tying the meso and the domain brains into a real, trackable session.

**Architecture:** `sessionRepo` (data layer) creates/loads/updates a workout session and its session_exercise → logged_set → set_segment rows; `getLastPerformance` fetches prior sets for "last time" + suggestions. Pure, tested helpers format the reference line, derive per-exercise status, and assemble the suggestion input (then call the Phase-2 `suggestNextSetOne`). One `ActiveWorkoutPage` holds session state and expands a log panel per exercise (accordion). Conventions: brand buttons, `bg-white dark:bg-[#0f1115]`, cards `bg-slate-100 dark:bg-[#1b2030]`, all copy via i18n; suggestion `reason` codes map to i18n.

**Scope (v1):** start/resume/end a session for the active meso's day; log single-segment sets (add/remove); optional RIR; manual deload toggle; add an exercise mid-session. **Deferred:** drop-set UI, swap, offline-first sync, automated microcycle/deload cadence.

**Tech Stack:** React, TypeScript, Tailwind, Supabase JS, Vitest. Reuses `src/domain` (suggestion) + `src/data` repos. No new dependencies.

---

## File Structure

```
src/data/
  rows.ts                       # + WorkoutSessionRow, SessionExerciseRow, LoggedSetRow, SetSegmentRow
  sessionRepo.ts                # start/getActive/getFull/addSet/updateSet/deleteSet/addExercise/setDeload/endSession/getLastPerformance
  mesoRepo.ts                   # + getActiveMeso, getMesoDayTargets (small additions)
src/features/session/
  sessionFormat.ts              # formatLastTime, exerciseStatus, buildSuggestionInput  [pure]
  sessionFormat.test.ts
  useElapsed.ts                 # tiny hook: live elapsed time from a start timestamp
  ActiveWorkoutPage.tsx         # start chooser OR active session (overview + per-exercise log accordion)
  ExerciseLogPanel.tsx          # last-time line, set rows, prefill+suggestion, add/remove set
src/App.tsx                     # + /workout route
src/features/profile/DashboardPage.tsx  # + "Start workout" / "Resume" entry
```

---

## Task 1: Row types + meso helpers + session repository

**Files:**
- Modify: `src/data/rows.ts`, `src/data/mesoRepo.ts`
- Create: `src/data/sessionRepo.ts`

- [ ] **Step 1: Append row types to `src/data/rows.ts`**

```ts
export interface WorkoutSessionRow {
  id: string
  user_id: string
  meso_id: string | null
  microcycle_id: string | null
  meso_day_id: string | null
  started_at: string
  ended_at: string | null
  is_deload: boolean
  status: 'in_progress' | 'completed' | 'skipped'
}

export interface SessionExerciseRow {
  id: string
  session_id: string
  exercise_id: string
  source: 'planned' | 'swapped' | 'added'
  order_index: number
}

export interface LoggedSetRow {
  id: string
  session_exercise_id: string
  set_index: number
  is_drop_set: boolean
}

export interface SetSegmentRow {
  id: string
  logged_set_id: string
  segment_index: number
  weight: number
  reps: number
  rir: number | null
}
```

- [ ] **Step 2: Add two helpers to `src/data/mesoRepo.ts`**

```ts
export async function getActiveMeso(userId: string): Promise<MesoRow | null> {
  const { data, error } = await supabase
    .from('meso').select('*').eq('user_id', userId).eq('is_active', true).maybeSingle()
  if (error) throw error
  return data as MesoRow | null
}

/** Map of exercise_id -> { targetSets, repMin, repMax } for a meso day (for targets + suggestions). */
export async function getMesoDayTargets(mesoDayId: string): Promise<Record<string, { targetSets: number; repMin: number; repMax: number }>> {
  const { data, error } = await supabase
    .from('meso_day_exercise').select('exercise_id, target_sets, rep_min, rep_max').eq('meso_day_id', mesoDayId)
  if (error) throw error
  const map: Record<string, { targetSets: number; repMin: number; repMax: number }> = {}
  for (const r of data ?? []) map[r.exercise_id] = { targetSets: r.target_sets, repMin: r.rep_min, repMax: r.rep_max }
  return map
}
```

- [ ] **Step 3: Create `src/data/sessionRepo.ts`**

```ts
import { supabase } from '../lib/supabase'
import type { WorkoutSessionRow, SessionExerciseRow, LoggedSetRow, SetSegmentRow } from './rows'
import type { SetResult } from '../domain/types'

export interface SessionExerciseFull extends SessionExerciseRow {
  sets: (LoggedSetRow & { segments: SetSegmentRow[] })[]
}
export interface SessionFull {
  session: WorkoutSessionRow
  exercises: SessionExerciseFull[]
}

export async function getActiveSession(userId: string): Promise<WorkoutSessionRow | null> {
  const { data, error } = await supabase
    .from('workout_session').select('*')
    .eq('user_id', userId).eq('status', 'in_progress')
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as WorkoutSessionRow | null
}

/** Starts a session for a meso day, pre-creating planned session_exercise rows from the meso plan. */
export async function startSession(
  userId: string,
  opts: { mesoId: string | null; mesoDayId: string | null; isDeload: boolean },
): Promise<string> {
  const { data, error } = await supabase
    .from('workout_session')
    .insert({ user_id: userId, meso_id: opts.mesoId, meso_day_id: opts.mesoDayId, is_deload: opts.isDeload, status: 'in_progress' })
    .select('id').single()
  if (error) throw error
  const sessionId = data.id as string
  if (opts.mesoDayId) {
    const { data: planned, error: pe } = await supabase
      .from('meso_day_exercise').select('exercise_id, order_index').eq('meso_day_id', opts.mesoDayId).order('order_index', { ascending: true })
    if (pe) throw pe
    if (planned && planned.length) {
      const rows = planned.map((p, i) => ({ session_id: sessionId, exercise_id: p.exercise_id, source: 'planned' as const, order_index: i }))
      const { error: se } = await supabase.from('session_exercise').insert(rows)
      if (se) throw se
    }
  }
  return sessionId
}

export async function getSessionFull(sessionId: string): Promise<SessionFull> {
  const { data: session, error: e1 } = await supabase.from('workout_session').select('*').eq('id', sessionId).single()
  if (e1) throw e1
  const { data: ses, error: e2 } = await supabase
    .from('session_exercise').select('*').eq('session_id', sessionId).order('order_index', { ascending: true })
  if (e2) throw e2
  const seIds = (ses ?? []).map((s) => s.id)
  let sets: LoggedSetRow[] = []
  let segments: SetSegmentRow[] = []
  if (seIds.length) {
    const { data: ls, error: e3 } = await supabase.from('logged_set').select('*').in('session_exercise_id', seIds).order('set_index', { ascending: true })
    if (e3) throw e3
    sets = (ls ?? []) as LoggedSetRow[]
    const lsIds = sets.map((s) => s.id)
    if (lsIds.length) {
      const { data: segs, error: e4 } = await supabase.from('set_segment').select('*').in('logged_set_id', lsIds).order('segment_index', { ascending: true })
      if (e4) throw e4
      segments = (segs ?? []) as SetSegmentRow[]
    }
  }
  return {
    session: session as WorkoutSessionRow,
    exercises: (ses as SessionExerciseRow[]).map((se) => ({
      ...se,
      sets: sets.filter((s) => s.session_exercise_id === se.id).map((s) => ({ ...s, segments: segments.filter((g) => g.logged_set_id === s.id) })),
    })),
  }
}

/** Adds a single-segment set (v1 has no drop-sets). Returns the new logged_set id. */
export async function addSet(sessionExerciseId: string, setIndex: number, seg: { weight: number; reps: number; rir: number | null }): Promise<void> {
  const { data, error } = await supabase
    .from('logged_set').insert({ session_exercise_id: sessionExerciseId, set_index: setIndex, is_drop_set: false }).select('id').single()
  if (error) throw error
  const { error: se } = await supabase
    .from('set_segment').insert({ logged_set_id: data.id, segment_index: 0, weight: seg.weight, reps: seg.reps, rir: seg.rir })
  if (se) throw se
}

export async function updateSegment(segmentId: string, seg: { weight: number; reps: number; rir: number | null }): Promise<void> {
  const { error } = await supabase.from('set_segment').update(seg).eq('id', segmentId)
  if (error) throw error
}

export async function deleteSet(loggedSetId: string): Promise<void> {
  const { error } = await supabase.from('logged_set').delete().eq('id', loggedSetId)
  if (error) throw error
}

export async function addSessionExercise(sessionId: string, exerciseId: string, orderIndex: number, source: 'added' | 'swapped' = 'added'): Promise<void> {
  const { error } = await supabase.from('session_exercise').insert({ session_id: sessionId, exercise_id: exerciseId, source, order_index: orderIndex })
  if (error) throw error
}

export async function setSessionDeload(sessionId: string, isDeload: boolean): Promise<void> {
  const { error } = await supabase.from('workout_session').update({ is_deload: isDeload }).eq('id', sessionId)
  if (error) throw error
}

export async function endSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('workout_session').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', sessionId)
  if (error) throw error
}

/** Most recent prior COMPLETED session's sets for an exercise (first segment of each set), for "last time" + suggestions. */
export async function getLastPerformance(userId: string, exerciseId: string, excludeSessionId: string): Promise<SetResult[] | null> {
  const { data: prior, error } = await supabase
    .from('session_exercise')
    .select('id, workout_session!inner(id, user_id, status, started_at)')
    .eq('exercise_id', exerciseId)
    .eq('workout_session.user_id', userId)
    .eq('workout_session.status', 'completed')
    .neq('workout_session.id', excludeSessionId)
    .order('started_at', { ascending: false, foreignTable: 'workout_session' })
    .limit(1)
  if (error) throw error
  const se = prior?.[0]
  if (!se) return null
  const { data: ls, error: e2 } = await supabase
    .from('logged_set').select('id').eq('session_exercise_id', se.id).order('set_index', { ascending: true })
  if (e2) throw e2
  const lsIds = (ls ?? []).map((r) => r.id)
  if (!lsIds.length) return null
  const { data: segs, error: e3 } = await supabase
    .from('set_segment').select('*').in('logged_set_id', lsIds).eq('segment_index', 0)
  if (e3) throw e3
  const bySet: Record<string, SetSegmentRow> = {}
  for (const s of (segs ?? []) as SetSegmentRow[]) bySet[s.logged_set_id] = s
  return lsIds.map((id) => bySet[id]).filter(Boolean).map((s) => ({ weight: s.weight, reps: s.reps, rir: s.rir }))
}
```

- [ ] **Step 4: Build** (after Task 2's pure file exists if imported; sessionRepo imports only rows + domain types, so it builds now) — `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/data/rows.ts src/data/mesoRepo.ts src/data/sessionRepo.ts
git commit -m "feat(data): workout session repository + meso active/targets helpers"
```

---

## Task 2: Pure session helpers (TDD)

**Files:**
- Create: `src/features/session/sessionFormat.ts`, `src/features/session/sessionFormat.test.ts`

- [ ] **Step 1: Write the failing test `src/features/session/sessionFormat.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { formatLastTime, exerciseStatus, buildSuggestionInput } from './sessionFormat'
import type { SetResult } from '../../domain/types'

describe('formatLastTime', () => {
  it('uses compact notation when all weights match', () => {
    const sets: SetResult[] = [{ weight: 25, reps: 8, rir: 2 }, { weight: 25, reps: 8, rir: 2 }, { weight: 25, reps: 7, rir: 1 }]
    expect(formatLastTime(sets)).toBe('25 × (8, 8, 7)')
  })
  it('lists per-set when weights differ', () => {
    const sets: SetResult[] = [{ weight: 25, reps: 8, rir: null }, { weight: 27.5, reps: 8, rir: null }]
    expect(formatLastTime(sets)).toBe('25×8 · 27.5×8')
  })
  it('returns null for no data', () => {
    expect(formatLastTime([])).toBeNull()
    expect(formatLastTime(null)).toBeNull()
  })
})

describe('exerciseStatus', () => {
  it('is not_started with zero sets', () => {
    expect(exerciseStatus(3, 0)).toBe('not_started')
  })
  it('is in_progress below target', () => {
    expect(exerciseStatus(3, 1)).toBe('in_progress')
  })
  it('is done at or above target', () => {
    expect(exerciseStatus(3, 3)).toBe('done')
    expect(exerciseStatus(3, 4)).toBe('done')
  })
})

describe('buildSuggestionInput', () => {
  it('assembles the suggestion-engine input from last performance + target + goal + deload', () => {
    const last: SetResult[] = [{ weight: 60, reps: 12, rir: 2 }]
    expect(buildSuggestionInput({ last, target: { repMin: 8, repMax: 12 }, goal: 'bulk', mechanic: 'compound', isDeload: false })).toEqual({
      lastSession: last, repRange: { min: 8, max: 12 }, goal: 'bulk', mechanic: 'compound', isDeload: false,
    })
  })
})
```

- [ ] **Step 2: Run it; confirm FAIL** — `npm test -- sessionFormat`.

- [ ] **Step 3: Implement `src/features/session/sessionFormat.ts`**

```ts
import type { SetResult, Goal, Mechanic } from '../../domain/types'
import type { SuggestionInput } from '../../domain/suggestion'

export type ExerciseStatus = 'not_started' | 'in_progress' | 'done'

export function formatLastTime(sets: SetResult[] | null): string | null {
  if (!sets || sets.length === 0) return null
  const allSameWeight = sets.every((s) => s.weight === sets[0].weight)
  if (allSameWeight) {
    return `${sets[0].weight} × (${sets.map((s) => s.reps).join(', ')})`
  }
  return sets.map((s) => `${s.weight}×${s.reps}`).join(' · ')
}

export function exerciseStatus(targetSets: number, completedSets: number): ExerciseStatus {
  if (completedSets <= 0) return 'not_started'
  if (completedSets >= targetSets) return 'done'
  return 'in_progress'
}

export function buildSuggestionInput(args: {
  last: SetResult[] | null
  target: { repMin: number; repMax: number }
  goal: Goal
  mechanic: Mechanic | null
  isDeload: boolean
}): SuggestionInput {
  return {
    lastSession: args.last,
    repRange: { min: args.target.repMin, max: args.target.repMax },
    goal: args.goal,
    mechanic: args.mechanic,
    isDeload: args.isDeload,
  }
}
```

- [ ] **Step 4: Run it; confirm PASS** — `npm test -- sessionFormat`. Then `npm run build`. Then make the Task 1 + Task 2 commits.

```bash
git add src/features/session/sessionFormat.ts src/features/session/sessionFormat.test.ts
git commit -m "feat(session): pure formatting, status, and suggestion-input helpers"
```

---

## Task 3: Active workout page (start/resume, overview, timer) + routing

**Files:**
- Create: `src/features/session/useElapsed.ts`, `src/features/session/ActiveWorkoutPage.tsx`
- Modify: `src/i18n/strings/en.json`, `src/App.tsx`, `src/features/profile/DashboardPage.tsx`

- [ ] **Step 1: Add i18n keys to `src/i18n/strings/en.json`** (merge; valid JSON)

```json
{
  "workout.start": "Start workout",
  "workout.resume": "Resume workout",
  "workout.pickDay": "Pick a day",
  "workout.noActiveMeso": "Activate a meso first to start a workout.",
  "workout.deload": "Deload session",
  "workout.end": "End workout",
  "workout.inProgress": "Workout in progress",
  "workout.addExercise": "Add exercise",
  "workout.status.not_started": "Not started",
  "workout.status.in_progress": "In progress",
  "workout.status.done": "Done",
  "workout.lastTime": "Last time",
  "workout.set": "Set",
  "workout.weight": "Weight",
  "workout.reps": "Reps",
  "workout.rir": "RIR",
  "workout.addSet": "Add set",
  "workout.suggestion.add_weight": "Add weight — you had reps to spare",
  "workout.suggestion.add_rep": "Add a rep",
  "workout.suggestion.hold_no_reserve": "Hold — no reps in reserve",
  "workout.suggestion.hold_missing_rir": "Hold — log RIR for weight suggestions",
  "workout.suggestion.rebuild": "Rebuild to the bottom of the range",
  "workout.suggestion.deload": "Deload — keep it easy",
  "nav.workout": "Workout"
}
```

- [ ] **Step 2: Implement `src/features/session/useElapsed.ts`**

```ts
import { useEffect, useState } from 'react'

/** Live mm:ss / h:mm:ss elapsed since an ISO start timestamp. */
export function useElapsed(startIso: string): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
```

- [ ] **Step 3: Implement `src/features/session/ActiveWorkoutPage.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from '../profile/useProfileData'
import { getActiveMeso, getMesoFull, getMesoDayTargets } from '../../data/mesoRepo'
import { getActiveSession, startSession, getSessionFull, endSession, setSessionDeload, addSessionExercise, type SessionFull } from '../../data/sessionRepo'
import { listExercises } from '../../data/exerciseRepo'
import type { ExerciseRow, MesoRow } from '../../data/rows'
import type { MesoFull } from '../mesos/mesoDraft'
import { useElapsed } from './useElapsed'
import { exerciseStatus } from './sessionFormat'
import { ExerciseLogPanel } from './ExerciseLogPanel'
import { ExercisePickerSheet } from '../mesos/ExercisePickerSheet'

export function ActiveWorkoutPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const { latestGoal } = useProfileData()

  const [activeMeso, setActiveMeso] = useState<MesoRow | null>(null)
  const [mesoFull, setMesoFull] = useState<MesoFull | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [full, setFull] = useState<SessionFull | null>(null)
  const [targets, setTargets] = useState<Record<string, { targetSets: number; repMin: number; repMax: number }>>({})
  const [exMap, setExMap] = useState<Record<string, ExerciseRow>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const loadSession = useCallback(async (id: string) => {
    const f = await getSessionFull(id)
    setFull(f)
    if (f.session.meso_day_id) setTargets(await getMesoDayTargets(f.session.meso_day_id))
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const [meso, exList, existing] = await Promise.all([getActiveMeso(userId), listExercises(), getActiveSession(userId)])
        setActiveMeso(meso)
        setExMap(Object.fromEntries(exList.map((e) => [e.id, e])))
        if (meso) setMesoFull(await getMesoFull(meso.id))
        if (existing) { setSessionId(existing.id); await loadSession(existing.id) }
      } finally {
        setLoading(false)
      }
    })()
  }, [userId, loadSession])

  async function start(mesoDayId: string, isDeload: boolean) {
    setBusy(true)
    try {
      const id = await startSession(userId, { mesoId: activeMeso?.id ?? null, mesoDayId, isDeload })
      setSessionId(id)
      await loadSession(id)
    } finally { setBusy(false) }
  }

  async function end() {
    if (!sessionId) return
    setBusy(true)
    try { await endSession(sessionId); navigate('/') } finally { setBusy(false) }
  }

  async function toggleDeload() {
    if (!full || !sessionId) return
    const next = !full.session.is_deload
    await setSessionDeload(sessionId, next)
    setFull({ ...full, session: { ...full.session, is_deload: next } })
  }

  async function addExercise(ex: ExerciseRow) {
    if (!sessionId || !full) return
    setExMap((m) => ({ ...m, [ex.id]: ex }))
    await addSessionExercise(sessionId, ex.id, full.exercises.length, 'added')
    await loadSession(sessionId)
    setPickerOpen(false)
  }

  if (loading) return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>

  // No active session: show the start chooser.
  if (!full) {
    return (
      <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
        <div className="mx-auto max-w-md space-y-4">
          <h1 className="text-xl font-bold">{t('workout.start')}</h1>
          {!activeMeso || !mesoFull ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('workout.noActiveMeso')}</p>
          ) : (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">{activeMeso.name} · {t('workout.pickDay')}</p>
              <ul className="space-y-2">
                {mesoFull.days.map((d) => (
                  <li key={d.id}>
                    <button disabled={busy} onClick={() => start(d.id, false)} className="w-full rounded-lg bg-brand-700 px-4 py-3 text-left font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
                      {d.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    )
  }

  // Active session: overview + per-exercise accordion.
  return (
    <div className="min-h-screen bg-white pb-24 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <Header startIso={full.session.started_at} isDeload={full.session.is_deload} onEnd={end} onToggleDeload={toggleDeload} busy={busy} />
      <div className="mx-auto max-w-md space-y-3 p-6">
        {full.exercises.map((se) => {
          const ex = exMap[se.exercise_id]
          const target = targets[se.exercise_id] ?? { targetSets: 3, repMin: 8, repMax: 12 }
          const status = exerciseStatus(target.targetSets, se.sets.length)
          const open = expanded === se.id
          return (
            <div key={se.id} className="rounded-xl bg-slate-100 dark:bg-[#1b2030]">
              <button onClick={() => setExpanded(open ? null : se.id)} className="flex w-full items-center justify-between p-4 text-left">
                <span className="font-semibold">{ex?.name ?? '…'}</span>
                <span className={`text-xs ${status === 'done' ? 'text-emerald-500' : status === 'in_progress' ? 'text-brand-500' : 'text-slate-400'}`}>
                  {se.sets.length}/{target.targetSets} · {t(`workout.status.${status}`)}
                </span>
              </button>
              {open && (
                <ExerciseLogPanel
                  userId={userId}
                  sessionId={full.session.id}
                  isDeload={full.session.is_deload}
                  goal={latestGoal?.goal ?? 'maintain'}
                  sessionExercise={se}
                  exercise={ex}
                  target={target}
                  onChanged={() => loadSession(full.session.id)}
                />
              )}
            </div>
          )
        })}
        <button onClick={() => setPickerOpen(true)} className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-brand-700 dark:bg-[#1b2030] dark:text-brand-400">
          {t('workout.addExercise')}
        </button>
      </div>
      {pickerOpen && <ExercisePickerSheet onPick={addExercise} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}

function Header({ startIso, isDeload, onEnd, onToggleDeload, busy }: { startIso: string; isDeload: boolean; onEnd: () => void; onToggleDeload: () => void; busy: boolean }) {
  const t = useT()
  const elapsed = useElapsed(startIso)
  return (
    <div className="bg-gradient-to-r from-brand-700 to-brand-600 p-4 text-white">
      <div className="mx-auto flex max-w-md items-center justify-between">
        <div>
          <div className="text-xs opacity-85">{t('workout.inProgress')}</div>
          <div className="text-2xl font-bold tabular-nums">{elapsed}</div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onToggleDeload} className={`rounded-lg px-2 py-1 text-xs font-semibold ${isDeload ? 'bg-white text-brand-700' : 'bg-white/20'}`}>
            🌙 {t('workout.deload')}
          </button>
          <button disabled={busy} onClick={onEnd} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 disabled:opacity-60">{t('workout.end')}</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the `/workout` route in `src/App.tsx`** — import and add inside the inner `<Routes>`:

```tsx
import { ActiveWorkoutPage } from './features/session/ActiveWorkoutPage'
```
```tsx
                <Route path="/workout" element={<RequireOnboarding><ActiveWorkoutPage /></RequireOnboarding>} />
```

- [ ] **Step 5: Add a dashboard entry** — in `src/features/profile/DashboardPage.tsx`, add a prominent button above the stats grid (after the header `div`):

```tsx
        <Link to="/workout" className="block w-full rounded-xl bg-brand-700 px-4 py-4 text-center text-lg font-bold text-white hover:bg-brand-800">
          {t('nav.workout')}
        </Link>
```

- [ ] **Step 6: Verify** — `npm test` green; `npm run build` succeeds (note: `ActiveWorkoutPage` imports `ExerciseLogPanel` from Task 4 — implement Task 4 before building/committing).

- [ ] **Step 7: Commit**

```bash
git add src/features/session/useElapsed.ts src/features/session/ActiveWorkoutPage.tsx src/i18n/strings/en.json src/App.tsx src/features/profile/DashboardPage.tsx
git commit -m "feat(session): active workout page with start, timer, deload, and overview"
```

---

## Task 4: Exercise log panel (sets, prefill, suggestion)

**Files:**
- Create: `src/features/session/ExerciseLogPanel.tsx`

- [ ] **Step 1: Implement `src/features/session/ExerciseLogPanel.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { addSet, updateSegment, deleteSet, getLastPerformance, type SessionExerciseFull } from '../../data/sessionRepo'
import { getLastPerformance as _keep } from '../../data/sessionRepo' // (no-op import guard; remove if lint complains)
import type { ExerciseRow } from '../../data/rows'
import type { Goal, SetResult } from '../../domain/types'
import { suggestNextSetOne } from '../../domain/suggestion'
import { formatLastTime, buildSuggestionInput } from './sessionFormat'

type Target = { targetSets: number; repMin: number; repMax: number }

export function ExerciseLogPanel({
  userId, sessionId, isDeload, goal, sessionExercise, exercise, target, onChanged,
}: {
  userId: string
  sessionId: string
  isDeload: boolean
  goal: Goal
  sessionExercise: SessionExerciseFull
  exercise: ExerciseRow | undefined
  target: Target
  onChanged: () => Promise<void> | void
}) {
  const t = useT()
  const [last, setLast] = useState<SetResult[] | null>(null)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [rir, setRir] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getLastPerformance(userId, sessionExercise.exercise_id, sessionId).then(setLast).catch(() => setLast(null))
  }, [userId, sessionExercise.exercise_id, sessionId])

  const suggestion = useMemo(() => {
    const input = buildSuggestionInput({ last, target: { repMin: target.repMin, repMax: target.repMax }, goal, mechanic: exercise?.mechanic ?? null, isDeload })
    return suggestNextSetOne(input)
  }, [last, target, goal, exercise, isDeload])

  const completed = sessionExercise.sets
  // Prefill: Set 1 from the suggestion; later sets from the last completed set this session.
  useEffect(() => {
    if (weight !== '' || reps !== '') return
    if (completed.length === 0 && suggestion) {
      setWeight(String(suggestion.weight))
      setReps(String(suggestion.repTarget))
    } else if (completed.length > 0) {
      const lastSeg = completed[completed.length - 1].segments[0]
      if (lastSeg) setWeight(String(lastSeg.weight))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion, completed.length])

  async function logSet() {
    if (weight === '' || reps === '') return
    setBusy(true)
    try {
      await addSet(sessionExercise.id, completed.length, { weight: Number(weight), reps: Number(reps), rir: rir === '' ? null : Number(rir) })
      setRir('')
      await onChanged()
    } finally { setBusy(false) }
  }

  const lastLine = formatLastTime(last)
  const numField = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-center text-slate-900 dark:border-slate-700 dark:bg-[#0f1115] dark:text-white'

  return (
    <div className="space-y-3 px-4 pb-4">
      {lastLine && (
        <div className="rounded-lg border-l-2 border-brand-600 bg-white px-3 py-2 text-sm dark:bg-[#0f1115]">
          <span className="text-xs uppercase text-slate-400">{t('workout.lastTime')}</span>
          <div className="font-medium">{lastLine}</div>
        </div>
      )}

      {/* logged sets */}
      <ul className="space-y-1">
        {completed.map((s, i) => {
          const seg = s.segments[0]
          return (
            <li key={s.id} className="grid grid-cols-[24px_1fr_1fr_1fr_28px] items-center gap-2 text-sm">
              <span className="font-semibold">{i + 1}</span>
              <input className={numField} defaultValue={seg?.weight} onBlur={(e) => seg && updateSegment(seg.id, { weight: Number(e.target.value), reps: seg.reps, rir: seg.rir }).then(onChanged)} />
              <input className={numField} defaultValue={seg?.reps} onBlur={(e) => seg && updateSegment(seg.id, { weight: seg.weight, reps: Number(e.target.value), rir: seg.rir }).then(onChanged)} />
              <input className={numField} defaultValue={seg?.rir ?? ''} placeholder={t('workout.rir')} onBlur={(e) => seg && updateSegment(seg.id, { weight: seg.weight, reps: seg.reps, rir: e.target.value === '' ? null : Number(e.target.value) }).then(onChanged)} />
              <button onClick={() => deleteSet(s.id).then(onChanged)} aria-label={t('mesos.delete')} className="text-slate-400">🗑</button>
            </li>
          )
        })}
      </ul>

      {/* next-set entry */}
      <div className="grid grid-cols-[24px_1fr_1fr_1fr_28px] items-center gap-2 text-sm">
        <span className="font-semibold text-slate-400">{completed.length + 1}</span>
        <input className={numField} inputMode="decimal" placeholder={t('workout.weight')} value={weight} onChange={(e) => setWeight(e.target.value)} />
        <input className={numField} inputMode="numeric" placeholder={t('workout.reps')} value={reps} onChange={(e) => setReps(e.target.value)} />
        <input className={numField} inputMode="numeric" placeholder={t('workout.rir')} value={rir} onChange={(e) => setRir(e.target.value)} />
        <span />
      </div>

      {suggestion && completed.length === 0 && (
        <p className="text-xs text-brand-500">💡 {t(`workout.suggestion.${suggestion.reason}`)}</p>
      )}

      <button disabled={busy} onClick={logSet} className="w-full rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
        {t('workout.addSet')}
      </button>
    </div>
  )
}
```

NOTE for the implementer: the second `getLastPerformance as _keep` import line is a mistake — do NOT include it. Import `getLastPerformance` once. Keep `addSet`, `updateSegment`, `deleteSet`, `getLastPerformance`, and the `SessionExerciseFull` type from `sessionRepo`.

- [ ] **Step 2: Verify** — `npm test` (all prior green); `npm run build` succeeds; `grep -rn "indigo-600" src` empty.

- [ ] **Step 3: Commit**

```bash
git add src/features/session/ExerciseLogPanel.tsx
git commit -m "feat(session): exercise log panel with prefill and suggestions"
```

---

## Self-Review Notes (verified against spec §5, §6, §7)

- **Logging model (spec §5):** workout_session → session_exercise (source planned/added) → logged_set → set_segment; v1 logs one segment per set (drop-sets deferred, schema-ready) ✓.
- **Non-linear day (spec §6 / mockup):** the overview lists the day's exercises; any can be expanded/logged in any order; status (done/in-progress/not-started) derived purely ✓.
- **Timer + deload (spec §6):** start sets started_at; live elapsed; End sets ended_at+completed; per-session deload toggle ✓ (automated cadence/debt deferred).
- **Last time + suggestion (spec §7):** `getLastPerformance` feeds `formatLastTime` (sheet notation) and `suggestNextSetOne` via `buildSuggestionInput`; Set-1 prefills from the suggestion, later sets from the last logged set ✓; suggestion `reason` mapped to i18n (domain stays i18n-free) ✓.
- **Add exercise (spec §6):** reuses `ExercisePickerSheet`; inserts a session_exercise with source 'added' ✓ (swap deferred).
- **Layering:** Supabase only in repos; pure helpers unit-tested; suggestion engine reused, not reimplemented ✓.
- **Known v1 limits (logged):** online writes only (offline-first deferred); microcycle_id always null (cadence deferred); set edits via onBlur (no per-keystroke save); single in-progress session per user (getActiveSession resumes it).
```
