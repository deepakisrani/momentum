# Momentum Phase 5 — Meso-Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, edit, duplicate, and activate mesocycles — scheduling style, deload cadence, custom day-types, and per-day exercise rows (target sets + rep range, picked from the library) — the core planning surface the session-logging screen will run off.

**Architecture:** `mesoRepo` (data-access layer) handles nested CRUD with id-preserving reconciliation so edits don't orphan history. Pure, unit-tested draft logic (`MesoDraft` + validate/move/from-full/strip-ids) holds all builder rules. UI: a meso list and a builder editor that reuses the Phase 4 exercise library (`listExercises` + `filterExercises`) via a picker sheet. Conventions: brand buttons, `bg-white dark:bg-[#0f1115]` surfaces, slate/`#1b2030` cards, all copy via i18n.

**Scope (v1):** create-blank + duplicate + edit + activate + delete. Prebuilt templates and drag-reorder are deferred (reorder via up/down buttons).

**Tech Stack:** React, TypeScript, Tailwind, Supabase JS, Vitest. No new dependencies.

---

## File Structure

```
src/data/
  rows.ts                    # + MesoRow, MesoDayRow, MesoDayExerciseRow
  mesoRepo.ts                # listMesos, getMesoFull, saveMeso (create/update reconcile), setActiveMeso, deleteMeso
src/features/mesos/
  mesoDraft.ts               # MesoDraft types + blankMeso/draftFromFull/stripIds/validateMeso/moveItem  [pure]
  mesoDraft.test.ts
  MesoListPage.tsx           # list, active badge, new (blank/duplicate), edit, activate, delete
  MesoBuilderPage.tsx        # settings + day tabs + per-day exercise rows + save
  ExercisePickerSheet.tsx    # reuse library list/filter to pick an exercise
src/App.tsx                  # + /mesos, /mesos/new, /mesos/:id/edit
src/features/profile/DashboardPage.tsx  # + link to /mesos
```

---

## Task 1: Meso row types + repository

**Files:**
- Modify: `src/data/rows.ts`
- Create: `src/data/mesoRepo.ts`

- [ ] **Step 1: Append meso row types to `src/data/rows.ts`** (the file already imports `SchedulingStyle`? if not, extend the domain-types import to include it)

Ensure the domain import includes `SchedulingStyle`:
```ts
import type { Sex, Goal, Units, Mechanic, SchedulingStyle } from '../domain/types'
```
Append:
```ts
export interface MesoRow {
  id: string
  user_id: string
  name: string
  scheduling_style: SchedulingStyle
  deload_every_n_microcycles: number | null
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface MesoDayRow {
  id: string
  meso_id: string
  label: string
  order_index: number
}

export interface MesoDayExerciseRow {
  id: string
  meso_day_id: string
  exercise_id: string
  order_index: number
  target_sets: number
  rep_min: number
  rep_max: number
}
```

- [ ] **Step 2: Create `src/data/mesoRepo.ts`**

```ts
import { supabase } from '../lib/supabase'
import type { MesoRow, MesoDayRow, MesoDayExerciseRow } from './rows'
import type { MesoDraft, DraftDay, DraftExercise, MesoFull } from '../features/mesos/mesoDraft'

export async function listMesos(userId: string): Promise<MesoRow[]> {
  const { data, error } = await supabase
    .from('meso')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as MesoRow[]
}

export async function getMesoFull(mesoId: string): Promise<MesoFull> {
  const { data: meso, error: me } = await supabase.from('meso').select('*').eq('id', mesoId).single()
  if (me) throw me
  const { data: days, error: de } = await supabase
    .from('meso_day').select('*').eq('meso_id', mesoId).order('order_index', { ascending: true })
  if (de) throw de
  const dayIds = (days ?? []).map((d) => d.id)
  let exercises: MesoDayExerciseRow[] = []
  if (dayIds.length) {
    const { data: ex, error: ee } = await supabase
      .from('meso_day_exercise').select('*').in('meso_day_id', dayIds).order('order_index', { ascending: true })
    if (ee) throw ee
    exercises = (ex ?? []) as MesoDayExerciseRow[]
  }
  return {
    meso: meso as MesoRow,
    days: (days as MesoDayRow[]).map((d) => ({ ...d, exercises: exercises.filter((e) => e.meso_day_id === d.id) })),
  }
}

export async function saveMeso(userId: string, draft: MesoDraft): Promise<string> {
  return draft.id ? updateMeso(draft) : createMeso(userId, draft)
}

async function createMeso(userId: string, draft: MesoDraft): Promise<string> {
  const { data, error } = await supabase
    .from('meso')
    .insert({
      user_id: userId,
      name: draft.name,
      scheduling_style: draft.schedulingStyle,
      deload_every_n_microcycles: draft.deloadEveryN,
      is_active: false,
    })
    .select('id')
    .single()
  if (error) throw error
  const mesoId = data.id as string
  for (let i = 0; i < draft.days.length; i++) {
    await insertDay(mesoId, draft.days[i], i)
  }
  return mesoId
}

async function insertDay(mesoId: string, day: DraftDay, order: number): Promise<void> {
  const { data, error } = await supabase
    .from('meso_day').insert({ meso_id: mesoId, label: day.label, order_index: order }).select('id').single()
  if (error) throw error
  await insertExercises(data.id as string, day.exercises)
}

async function insertExercises(dayId: string, exercises: DraftExercise[]): Promise<void> {
  if (!exercises.length) return
  const rows = exercises.map((e, i) => ({
    meso_day_id: dayId, exercise_id: e.exerciseId, order_index: i,
    target_sets: e.targetSets, rep_min: e.repMin, rep_max: e.repMax,
  }))
  const { error } = await supabase.from('meso_day_exercise').insert(rows)
  if (error) throw error
}

async function updateMeso(draft: MesoDraft): Promise<string> {
  const mesoId = draft.id as string
  const { error: ue } = await supabase
    .from('meso')
    .update({ name: draft.name, scheduling_style: draft.schedulingStyle, deload_every_n_microcycles: draft.deloadEveryN })
    .eq('id', mesoId)
  if (ue) throw ue

  // Reconcile days by id (preserves history: workout_session.meso_day_id).
  const { data: existingDays, error: ee } = await supabase.from('meso_day').select('id').eq('meso_id', mesoId)
  if (ee) throw ee
  const keptDayIds = draft.days.filter((d) => d.id).map((d) => d.id as string)
  const removedDayIds = (existingDays ?? []).map((d) => d.id).filter((id) => !keptDayIds.includes(id))
  if (removedDayIds.length) {
    const { error } = await supabase.from('meso_day').delete().in('id', removedDayIds)
    if (error) throw error
  }

  for (let i = 0; i < draft.days.length; i++) {
    const day = draft.days[i]
    let dayId = day.id
    if (dayId) {
      const { error } = await supabase.from('meso_day').update({ label: day.label, order_index: i }).eq('id', dayId)
      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from('meso_day').insert({ meso_id: mesoId, label: day.label, order_index: i }).select('id').single()
      if (error) throw error
      dayId = data.id as string
    }
    await reconcileExercises(dayId, day.exercises)
  }
  return mesoId
}

async function reconcileExercises(dayId: string, exercises: DraftExercise[]): Promise<void> {
  const { data: existing, error: ee } = await supabase.from('meso_day_exercise').select('id').eq('meso_day_id', dayId)
  if (ee) throw ee
  const keptIds = exercises.filter((e) => e.id).map((e) => e.id as string)
  const removed = (existing ?? []).map((e) => e.id).filter((id) => !keptIds.includes(id))
  if (removed.length) {
    const { error } = await supabase.from('meso_day_exercise').delete().in('id', removed)
    if (error) throw error
  }
  for (let i = 0; i < exercises.length; i++) {
    const e = exercises[i]
    const payload = {
      meso_day_id: dayId, exercise_id: e.exerciseId, order_index: i,
      target_sets: e.targetSets, rep_min: e.repMin, rep_max: e.repMax,
    }
    if (e.id) {
      const { error } = await supabase.from('meso_day_exercise').update(payload).eq('id', e.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('meso_day_exercise').insert(payload)
      if (error) throw error
    }
  }
}

/** Exactly one active meso per user. Unset all first (the partial unique index forbids two actives). */
export async function setActiveMeso(userId: string, mesoId: string): Promise<void> {
  const { error: e1 } = await supabase.from('meso').update({ is_active: false }).eq('user_id', userId)
  if (e1) throw e1
  const { error: e2 } = await supabase.from('meso').update({ is_active: true }).eq('id', mesoId)
  if (e2) throw e2
}

export async function deleteMeso(mesoId: string): Promise<void> {
  const { error } = await supabase.from('meso').delete().eq('id', mesoId)
  if (error) throw error
}
```

- [ ] **Step 3: Verify build** — `npm run build` (will fail until `mesoDraft.ts` exists from Task 2; if so, do Task 2 first then build). To keep ordering simple, proceed to Task 2 before building.

- [ ] **Step 4: Commit** (after Task 2 compiles)

```bash
git add src/data/rows.ts src/data/mesoRepo.ts
git commit -m "feat(data): meso repository with id-preserving reconciliation"
```

---

## Task 2: Pure meso-draft logic (TDD)

**Files:**
- Create: `src/features/mesos/mesoDraft.ts`, `src/features/mesos/mesoDraft.test.ts`

- [ ] **Step 1: Write the failing test `src/features/mesos/mesoDraft.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it; confirm FAIL** — `npm test -- mesoDraft`.

- [ ] **Step 3: Implement `src/features/mesos/mesoDraft.ts`**

```ts
import type { SchedulingStyle } from '../../domain/types'
import type { MesoRow, MesoDayRow, MesoDayExerciseRow } from '../../data/rows'

export interface DraftExercise {
  id?: string
  exerciseId: string
  targetSets: number
  repMin: number
  repMax: number
}

export interface DraftDay {
  id?: string
  label: string
  exercises: DraftExercise[]
}

export interface MesoDraft {
  id?: string
  name: string
  schedulingStyle: SchedulingStyle
  deloadEveryN: number | null
  days: DraftDay[]
}

export interface MesoFull {
  meso: MesoRow
  days: (MesoDayRow & { exercises: MesoDayExerciseRow[] })[]
}

export function blankMeso(): MesoDraft {
  return { name: '', schedulingStyle: 'calendar_week', deloadEveryN: 5, days: [] }
}

export function draftFromFull(full: MesoFull): MesoDraft {
  return {
    id: full.meso.id,
    name: full.meso.name,
    schedulingStyle: full.meso.scheduling_style,
    deloadEveryN: full.meso.deload_every_n_microcycles,
    days: full.days.map((d) => ({
      id: d.id,
      label: d.label,
      exercises: d.exercises.map((e) => ({
        id: e.id, exerciseId: e.exercise_id, targetSets: e.target_sets, repMin: e.rep_min, repMax: e.rep_max,
      })),
    })),
  }
}

/** Drops all ids so a save creates a brand-new meso (used for "duplicate"). */
export function stripIds(draft: MesoDraft): MesoDraft {
  return {
    name: draft.name,
    schedulingStyle: draft.schedulingStyle,
    deloadEveryN: draft.deloadEveryN,
    days: draft.days.map((d) => ({
      label: d.label,
      exercises: d.exercises.map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, repMin: e.repMin, repMax: e.repMax })),
    })),
  }
}

/** Returns a list of error codes (empty = valid). The UI maps codes to copy. */
export function validateMeso(draft: MesoDraft): string[] {
  const errors: string[] = []
  if (!draft.name.trim()) errors.push('name')
  if (draft.days.length === 0) errors.push('days')
  draft.days.forEach((d, i) => {
    if (!d.label.trim()) errors.push(`day.${i}.label`)
    d.exercises.forEach((e, j) => {
      if (e.repMin > e.repMax) errors.push(`day.${i}.ex.${j}.range`)
      if (e.targetSets < 1) errors.push(`day.${i}.ex.${j}.sets`)
    })
  })
  return errors
}

export function moveItem<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir
  if (j < 0 || j >= arr.length) return arr
  const copy = arr.slice()
  ;[copy[index], copy[j]] = [copy[j], copy[index]]
  return copy
}
```

- [ ] **Step 4: Run it; confirm PASS** — `npm test -- mesoDraft`. Then `npm run build` (now `mesoRepo` compiles too). Then make the Task 1 commit, then this commit:

```bash
git add src/features/mesos/mesoDraft.ts src/features/mesos/mesoDraft.test.ts
git commit -m "feat(mesos): pure meso-draft logic"
```

---

## Task 3: Meso list page + routing + nav + i18n

**Files:**
- Create: `src/features/mesos/MesoListPage.tsx`
- Modify: `src/i18n/strings/en.json`, `src/App.tsx`, `src/features/profile/DashboardPage.tsx`

- [ ] **Step 1: Add i18n keys to `src/i18n/strings/en.json`** (merge; valid JSON)

```json
{
  "mesos.title": "Mesocycles",
  "mesos.new": "New meso",
  "mesos.blank": "Blank",
  "mesos.duplicate": "Duplicate",
  "mesos.active": "Active",
  "mesos.activate": "Make active",
  "mesos.edit": "Edit",
  "mesos.delete": "Delete",
  "mesos.deleteConfirm": "Delete this meso?",
  "mesos.empty": "No mesocycles yet. Create your first.",
  "mesos.copySuffix": " (copy)",
  "nav.mesos": "Mesos",
  "meso.name": "Meso name",
  "meso.schedule": "Scheduling",
  "meso.schedule.calendar_week": "Calendar week",
  "meso.schedule.continuous": "Continuous rotation",
  "meso.deloadEvery": "Deload every (microcycles)",
  "meso.deloadNever": "Never",
  "meso.addDay": "Add day",
  "meso.dayLabel": "Day name",
  "meso.removeDay": "Remove day",
  "meso.addExercise": "Add exercise",
  "meso.sets": "Sets",
  "meso.reps": "Reps",
  "meso.save": "Save meso",
  "meso.saveActivate": "Save & activate",
  "meso.noExercises": "No exercises yet.",
  "meso.invalid": "Please fix the highlighted fields.",
  "meso.moveUp": "Move up",
  "meso.moveDown": "Move down",
  "meso.remove": "Remove"
}
```

- [ ] **Step 2: Implement `src/features/mesos/MesoListPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { listMesos, setActiveMeso, deleteMeso, getMesoFull } from '../../data/mesoRepo'
import { saveMeso } from '../../data/mesoRepo'
import { draftFromFull, stripIds } from './mesoDraft'
import type { MesoRow } from '../../data/rows'

export function MesoListPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [mesos, setMesos] = useState<MesoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      setMesos(await listMesos(userId))
      setError(null)
    } catch (e) {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function activate(id: string) {
    setBusy(true)
    try { await setActiveMeso(userId, id); await reload() } finally { setBusy(false) }
  }

  async function remove(id: string) {
    if (!window.confirm(t('mesos.deleteConfirm'))) return
    setBusy(true)
    try { await deleteMeso(id); await reload() } finally { setBusy(false) }
  }

  async function duplicate(id: string) {
    setBusy(true)
    try {
      const full = await getMesoFull(id)
      const draft = stripIds(draftFromFull(full))
      draft.name = full.meso.name + t('mesos.copySuffix')
      const newId = await saveMeso(userId, draft)
      navigate(`/mesos/${newId}/edit`)
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-slate-500 dark:text-slate-400">{t('nav.back')}</Link>
          <h1 className="text-xl font-bold">{t('mesos.title')}</h1>
          <Link to="/mesos/new" className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800">{t('mesos.new')}</Link>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
        ) : mesos.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('mesos.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {mesos.map((m) => (
              <li key={m.id} className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{m.name}</span>
                  {m.is_active && <span className="rounded bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">{t('mesos.active')}</span>}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t(`meso.schedule.${m.scheduling_style}`)}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <Link to={`/mesos/${m.id}/edit`} className="rounded-lg bg-white px-3 py-1.5 font-medium dark:bg-[#0f1115]">{t('mesos.edit')}</Link>
                  {!m.is_active && <button disabled={busy} onClick={() => activate(m.id)} className="rounded-lg bg-brand-700 px-3 py-1.5 font-medium text-white hover:bg-brand-800 disabled:opacity-60">{t('mesos.activate')}</button>}
                  <button disabled={busy} onClick={() => duplicate(m.id)} className="rounded-lg bg-white px-3 py-1.5 font-medium dark:bg-[#0f1115]">{t('mesos.duplicate')}</button>
                  <button disabled={busy} onClick={() => remove(m.id)} className="rounded-lg px-3 py-1.5 font-medium text-red-500">{t('mesos.delete')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add routes in `src/App.tsx`** — import the pages and add three routes inside the inner `<Routes>`:

```tsx
import { MesoListPage } from './features/mesos/MesoListPage'
import { MesoBuilderPage } from './features/mesos/MesoBuilderPage'
```
```tsx
                <Route path="/mesos" element={<RequireOnboarding><MesoListPage /></RequireOnboarding>} />
                <Route path="/mesos/new" element={<RequireOnboarding><MesoBuilderPage /></RequireOnboarding>} />
                <Route path="/mesos/:id/edit" element={<RequireOnboarding><MesoBuilderPage /></RequireOnboarding>} />
```

- [ ] **Step 4: Add a dashboard link** — in `src/features/profile/DashboardPage.tsx`, in the header's link group (next to the Exercises link), add:

```tsx
            <Link to="/mesos" className="text-sm font-medium text-brand-700 dark:text-brand-400">{t('nav.mesos')}</Link>
```

- [ ] **Step 5: Verify** — `npm test` green; `npm run build` succeeds (note: `MesoBuilderPage` must exist for the import — it's created in Task 4; do Task 4 before building/committing if needed, or stub then replace). Recommended: implement Task 4 before this build step.

- [ ] **Step 6: Commit**

```bash
git add src/features/mesos/MesoListPage.tsx src/i18n/strings/en.json src/App.tsx src/features/profile/DashboardPage.tsx
git commit -m "feat(mesos): meso list with activate, duplicate, delete"
```

---

## Task 4: Meso builder page + exercise picker

**Files:**
- Create: `src/features/mesos/MesoBuilderPage.tsx`, `src/features/mesos/ExercisePickerSheet.tsx`

- [ ] **Step 1: Implement `src/features/mesos/ExercisePickerSheet.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { listExercises } from '../../data/exerciseRepo'
import { filterExercises, distinctMuscleGroups } from '../exercises/filterExercises'
import type { ExerciseRow } from '../../data/rows'

export function ExercisePickerSheet({ onPick, onClose }: { onPick: (ex: ExerciseRow) => void; onClose: () => void }) {
  const t = useT()
  const [all, setAll] = useState<ExerciseRow[]>([])
  const [query, setQuery] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<string | 'all'>('all')

  useEffect(() => { listExercises().then(setAll).catch(() => {}) }, [])

  const muscles = useMemo(() => distinctMuscleGroups(all), [all])
  const filtered = useMemo(() => filterExercises(all, { query, muscleGroup, mechanic: 'all' }), [all, query, muscleGroup])
  const control = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 text-slate-900 dark:bg-[#0f1115] dark:text-white" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{t('meso.addExercise')}</h2>
          <button onClick={onClose} className="text-sm text-slate-500 dark:text-slate-400">{t('exercises.cancel')}</button>
        </div>
        <input className={`${control} mb-2`} placeholder={t('exercises.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className={`${control} mb-3`} value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
          <option value="all">{t('exercises.allMuscles')}</option>
          {muscles.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <ul className="space-y-1">
          {filtered.map((e) => (
            <li key={e.id}>
              <button onClick={() => onPick(e)} className="w-full rounded-lg bg-slate-100 px-3 py-2 text-left dark:bg-[#1b2030]">
                <span className="font-medium">{e.name}</span>
                <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{e.muscle_group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement `src/features/mesos/MesoBuilderPage.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { getMesoFull, saveMeso } from '../../data/mesoRepo'
import { listExercises } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import type { SchedulingStyle } from '../../domain/types'
import { blankMeso, draftFromFull, validateMeso, moveItem, type MesoDraft, type DraftDay } from './mesoDraft'
import { ExercisePickerSheet } from './ExercisePickerSheet'

const SCHEDULES: SchedulingStyle[] = ['calendar_week', 'continuous']

export function MesoBuilderPage() {
  const t = useT()
  const navigate = useNavigate()
  const { id } = useParams()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''

  const [draft, setDraft] = useState<MesoDraft>(blankMeso())
  const [activeDay, setActiveDay] = useState(0)
  const [exMap, setExMap] = useState<Record<string, ExerciseRow>>({})
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [showError, setShowError] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    listExercises().then((list) => setExMap(Object.fromEntries(list.map((e) => [e.id, e])))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    getMesoFull(id).then((full) => setDraft(draftFromFull(full))).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const errors = useMemo(() => validateMeso(draft), [draft])

  function update(mut: (d: MesoDraft) => void) {
    setDraft((prev) => { const copy = structuredClone(prev); mut(copy); return copy })
  }

  function addDay() {
    update((d) => d.days.push({ label: `Day ${d.days.length + 1}`, exercises: [] }))
    setActiveDay(draft.days.length)
  }
  function removeDay(i: number) {
    update((d) => d.days.splice(i, 1))
    setActiveDay((a) => Math.max(0, a - (i <= a ? 1 : 0)))
  }
  function moveDay(i: number, dir: -1 | 1) { update((d) => { d.days = moveItem(d.days, i, dir) }); setActiveDay((a) => (a === i ? i + dir : a)) }

  function addExercise(ex: ExerciseRow) {
    update((d) => d.days[activeDay].exercises.push({ exerciseId: ex.id, targetSets: 3, repMin: 8, repMax: 12 }))
    setExMap((m) => ({ ...m, [ex.id]: ex }))
    setPickerOpen(false)
  }

  async function save(activate: boolean) {
    if (errors.length) { setShowError(true); return }
    setSaving(true)
    try {
      const newId = await saveMeso(userId, draft)
      if (activate) {
        const { setActiveMeso } = await import('../../data/mesoRepo')
        await setActiveMeso(userId, newId)
      }
      navigate('/mesos')
    } catch {
      setShowError(true)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>

  const day: DraftDay | undefined = draft.days[activeDay]
  const control = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white'
  const numField = 'w-14 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-slate-900 dark:border-slate-700 dark:bg-[#0f1115] dark:text-white'

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-md space-y-4">
        <button onClick={() => navigate('/mesos')} className="text-sm text-slate-500 dark:text-slate-400">{t('nav.back')}</button>

        <input className={`${control} w-full text-lg font-bold`} placeholder={t('meso.name')} value={draft.name} onChange={(e) => update((d) => { d.name = e.target.value })} />

        <div className="flex gap-2">
          <select className={`${control} flex-1`} value={draft.schedulingStyle} onChange={(e) => update((d) => { d.schedulingStyle = e.target.value as SchedulingStyle })}>
            {SCHEDULES.map((s) => <option key={s} value={s}>{t(`meso.schedule.${s}`)}</option>)}
          </select>
          <select className={`${control} flex-1`} value={draft.deloadEveryN ?? 0} onChange={(e) => update((d) => { d.deloadEveryN = Number(e.target.value) || null })}>
            <option value={0}>{t('meso.deloadNever')}</option>
            {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Day tabs */}
        <div className="flex flex-wrap gap-2">
          {draft.days.map((d, i) => (
            <button key={i} onClick={() => setActiveDay(i)} className={`rounded-full px-3 py-1 text-sm ${i === activeDay ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-[#1b2030]'}`}>
              {d.label || `Day ${i + 1}`}
            </button>
          ))}
          <button onClick={addDay} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-brand-700 dark:bg-[#1b2030] dark:text-brand-400">+ {t('meso.addDay')}</button>
        </div>

        {day && (
          <div className="space-y-3 rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
            <div className="flex items-center gap-2">
              <input className={`${control} flex-1`} placeholder={t('meso.dayLabel')} value={day.label} onChange={(e) => update((d) => { d.days[activeDay].label = e.target.value })} />
              <button onClick={() => moveDay(activeDay, -1)} aria-label={t('meso.moveUp')} className="px-2">↑</button>
              <button onClick={() => moveDay(activeDay, 1)} aria-label={t('meso.moveDown')} className="px-2">↓</button>
              <button onClick={() => removeDay(activeDay)} aria-label={t('meso.removeDay')} className="px-2 text-red-500">🗑</button>
            </div>

            {day.exercises.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{t('meso.noExercises')}</p>}
            <ul className="space-y-2">
              {day.exercises.map((ex, j) => (
                <li key={j} className="rounded-lg bg-white p-3 dark:bg-[#0f1115]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{exMap[ex.exerciseId]?.name ?? '…'}</span>
                    <div className="flex gap-1 text-slate-500 dark:text-slate-400">
                      <button onClick={() => update((d) => { d.days[activeDay].exercises = moveItem(d.days[activeDay].exercises, j, -1) })} aria-label={t('meso.moveUp')} className="px-1">↑</button>
                      <button onClick={() => update((d) => { d.days[activeDay].exercises = moveItem(d.days[activeDay].exercises, j, 1) })} aria-label={t('meso.moveDown')} className="px-1">↓</button>
                      <button onClick={() => update((d) => { d.days[activeDay].exercises.splice(j, 1) })} aria-label={t('meso.remove')} className="px-1 text-red-500">✕</button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <label className="flex items-center gap-1">{t('meso.sets')}
                      <input className={numField} type="number" min="1" value={ex.targetSets} onChange={(e) => update((d) => { d.days[activeDay].exercises[j].targetSets = Number(e.target.value) })} />
                    </label>
                    <label className="flex items-center gap-1">{t('meso.reps')}
                      <input className={numField} type="number" min="1" value={ex.repMin} onChange={(e) => update((d) => { d.days[activeDay].exercises[j].repMin = Number(e.target.value) })} />
                      <span>–</span>
                      <input className={numField} type="number" min="1" value={ex.repMax} onChange={(e) => update((d) => { d.days[activeDay].exercises[j].repMax = Number(e.target.value) })} />
                    </label>
                  </div>
                </li>
              ))}
            </ul>

            <button onClick={() => setPickerOpen(true)} className="w-full rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800">+ {t('meso.addExercise')}</button>
          </div>
        )}

        {showError && errors.length > 0 && <p className="text-sm text-red-500">{t('meso.invalid')}</p>}

        <div className="flex gap-2">
          <button disabled={saving} onClick={() => save(false)} className="flex-1 rounded-lg bg-slate-200 px-4 py-3 font-semibold text-slate-900 disabled:opacity-60 dark:bg-[#1b2030] dark:text-white">{t('meso.save')}</button>
          <button disabled={saving} onClick={() => save(true)} className="flex-1 rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{t('meso.saveActivate')}</button>
        </div>
      </div>

      {pickerOpen && <ExercisePickerSheet onPick={addExercise} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}
```

- [ ] **Step 3: Verify** — `npm test` (all prior tests still green) and `npm run build` succeeds. Confirm no `indigo-600` (`grep -rn indigo-600 src`).

- [ ] **Step 4: Commit**

```bash
git add src/features/mesos/MesoBuilderPage.tsx src/features/mesos/ExercisePickerSheet.tsx
git commit -m "feat(mesos): meso builder with day tabs, exercise rows, and picker"
```

---

## Self-Review Notes (verified against spec §5, §6)

- **Meso model (spec §5):** name, scheduling_style, deload_every_n_microcycles, custom-labelled days (order_index), per-day exercise rows (exercise_id, order_index, target_sets, rep_min, rep_max) ✓.
- **Builder UX (brainstorm mockup):** day-types as tabs, per-day exercise rows with sets + rep range, add via library picker (reuses Phase 4) ✓. Reorder via up/down (drag deferred); templates deferred.
- **One active meso (spec §5):** `setActiveMeso` unsets all then sets one, honoring the partial unique index ✓.
- **Edit preserves history (spec §5):** `updateMeso` reconciles days/exercises by id; only genuinely removed rows are deleted, so `workout_session.meso_day_id` survives edits ✓.
- **Duplicate / blank launch pads (spec §6):** `stripIds` powers duplicate; `blankMeso` powers blank ✓.
- **Layering:** Supabase only in `mesoRepo`; pure draft logic unit-tested; UI composes repo + pure + the Phase-4 library ✓.
- **i18n:** all copy keyed incl. schedule labels and validation message (codes from `validateMeso` mapped in the UI) ✓.
- **Type consistency:** `MesoRow`/`MesoDayRow`/`MesoDayExerciseRow` defined once in `rows.ts`; `MesoDraft`/`DraftDay`/`DraftExercise`/`MesoFull` shared between repo and UI; `mesoRepo` imports draft types from `mesoDraft` (one direction) ✓.
- **Known v1 limits (logged):** saves are sequential (not a single transaction) — a mid-save failure can leave partial state (rare; acceptable for now); list renders all mesos (small); reorder is up/down not drag.
```
