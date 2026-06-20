# Momentum Phase 4 — Exercise Library UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browsable, searchable exercise library screen — filter the 873 seeded exercises by name / muscle group / mechanic, and add custom (private) exercises — establishing the `exerciseRepo` and reusable filter logic the meso-builder and session logging will consume.

**Architecture:** Adds `exerciseRepo` to the data-access layer (the only place besides auth/lib that imports Supabase), pure unit-tested filter helpers, and an `ExerciseLibraryPage` reachable at `/exercises` from a dashboard link. Follows the established conventions: brand-colored buttons, `bg-white dark:bg-[#0f1115]` surfaces, all copy via i18n, RLS handles visibility (global + own + public).

**Tech Stack:** React, TypeScript, Tailwind, Supabase JS, Vitest. No new dependencies.

---

## File Structure

```
src/data/
  rows.ts                       # + ExerciseRow
  exerciseRepo.ts               # listExercises, addCustomExercise
src/features/exercises/
  filterExercises.ts            # filterExercises, distinctMuscleGroups, distinctEquipment  [pure]
  filterExercises.test.ts
  ExerciseLibraryPage.tsx       # search + filters + list + add-custom form
src/App.tsx                     # + /exercises route
src/features/profile/DashboardPage.tsx  # + link to /exercises
```

---

## Task 1: Exercise row type + repository

**Files:**
- Modify: `src/data/rows.ts`
- Create: `src/data/exerciseRepo.ts`

- [ ] **Step 1: Add `ExerciseRow` to `src/data/rows.ts`** (append; keep existing types and the existing `import type { Sex, Goal, Units }` — extend it to include `Mechanic`)

Change the existing import line to also import `Mechanic`:
```ts
import type { Sex, Goal, Units, Mechanic } from '../domain/types'
```
Append:
```ts
export interface ExerciseRow {
  id: string
  owner_user_id: string | null
  name: string
  muscle_group: string
  equipment: string | null
  mechanic: Mechanic | null
  is_public: boolean
}
```

- [ ] **Step 2: Create `src/data/exerciseRepo.ts`**

```ts
import { supabase } from '../lib/supabase'
import type { ExerciseRow } from './rows'
import type { Mechanic } from '../domain/types'

export async function listExercises(): Promise<ExerciseRow[]> {
  const { data, error } = await supabase.from('exercise').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as ExerciseRow[]
}

export interface NewExercise {
  name: string
  muscle_group: string
  equipment: string | null
  mechanic: Mechanic | null
}

/** Inserts a private custom exercise owned by the user (RLS requires owner_user_id = auth.uid()). */
export async function addCustomExercise(userId: string, ex: NewExercise): Promise<ExerciseRow> {
  const { data, error } = await supabase
    .from('exercise')
    .insert({ owner_user_id: userId, is_public: false, ...ex })
    .select('*')
    .single()
  if (error) throw error
  return data as ExerciseRow
}
```

- [ ] **Step 3: Verify build** — `npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/data/rows.ts src/data/exerciseRepo.ts
git commit -m "feat(data): exercise repository"
```

---

## Task 2: Pure filter helpers (TDD)

**Files:**
- Create: `src/features/exercises/filterExercises.ts`, `src/features/exercises/filterExercises.test.ts`

- [ ] **Step 1: Write the failing test `src/features/exercises/filterExercises.test.ts`**

```ts
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
})

describe('distinct helpers', () => {
  it('returns sorted distinct muscle groups', () => {
    expect(distinctMuscleGroups(list)).toEqual(['biceps', 'chest', 'hamstrings'])
  })
  it('returns sorted distinct equipment, ignoring null', () => {
    expect(distinctEquipment([...list, ex({ id: '5', equipment: null })])).toEqual(['barbell', 'dumbbell', 'machine'])
  })
})
```

- [ ] **Step 2: Run it; confirm FAIL** — `npm test -- filterExercises`.

- [ ] **Step 3: Implement `src/features/exercises/filterExercises.ts`**

```ts
import type { ExerciseRow } from '../../data/rows'
import type { Mechanic } from '../../domain/types'

export interface ExerciseFilter {
  query: string
  muscleGroup: string | 'all'
  mechanic: Mechanic | 'all'
}

export function filterExercises(exercises: ExerciseRow[], f: ExerciseFilter): ExerciseRow[] {
  const q = f.query.trim().toLowerCase()
  return exercises.filter((e) => {
    if (q && !e.name.toLowerCase().includes(q)) return false
    if (f.muscleGroup !== 'all' && e.muscle_group !== f.muscleGroup) return false
    if (f.mechanic !== 'all' && e.mechanic !== f.mechanic) return false
    return true
  })
}

export function distinctMuscleGroups(exercises: ExerciseRow[]): string[] {
  return [...new Set(exercises.map((e) => e.muscle_group))].sort()
}

export function distinctEquipment(exercises: ExerciseRow[]): string[] {
  return [...new Set(exercises.map((e) => e.equipment).filter((v): v is string => v != null))].sort()
}
```

- [ ] **Step 4: Run it; confirm PASS** — `npm test -- filterExercises`.

- [ ] **Step 5: Commit**

```bash
git add src/features/exercises/filterExercises.ts src/features/exercises/filterExercises.test.ts
git commit -m "feat(exercises): pure filter and distinct helpers"
```

---

## Task 3: Exercise library page + i18n + routing

**Files:**
- Create: `src/features/exercises/ExerciseLibraryPage.tsx`
- Modify: `src/i18n/strings/en.json`, `src/App.tsx`, `src/features/profile/DashboardPage.tsx`

- [ ] **Step 1: Add i18n keys to `src/i18n/strings/en.json`** (merge in; valid JSON)

```json
{
  "exercises.title": "Exercises",
  "exercises.search": "Search exercises",
  "exercises.allMuscles": "All muscles",
  "exercises.allMechanics": "All types",
  "exercises.mechanic.compound": "Compound",
  "exercises.mechanic.isolation": "Isolation",
  "exercises.custom": "Custom",
  "exercises.addCustom": "Add exercise",
  "exercises.name": "Name",
  "exercises.muscleGroup": "Muscle group",
  "exercises.equipment": "Equipment",
  "exercises.mechanicLabel": "Type",
  "exercises.save": "Save exercise",
  "exercises.cancel": "Cancel",
  "exercises.empty": "No exercises match.",
  "exercises.countShown": "{shown} of {total}",
  "nav.exercises": "Exercises",
  "nav.back": "← Back"
}
```

- [ ] **Step 2: Implement `src/features/exercises/ExerciseLibraryPage.tsx`**

```tsx
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { listExercises, addCustomExercise } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import type { Mechanic } from '../../domain/types'
import { filterExercises, distinctMuscleGroups, distinctEquipment } from './filterExercises'

export function ExerciseLibraryPage() {
  const t = useT()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''

  const [all, setAll] = useState<ExerciseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<string | 'all'>('all')
  const [mechanic, setMechanic] = useState<Mechanic | 'all'>('all')

  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    listExercises()
      .then(setAll)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

  const muscleOptions = useMemo(() => distinctMuscleGroups(all), [all])
  const equipmentOptions = useMemo(() => distinctEquipment(all), [all])
  const filtered = useMemo(
    () => filterExercises(all, { query, muscleGroup, mechanic }),
    [all, query, muscleGroup, mechanic],
  )

  function onAdded(row: ExerciseRow) {
    setAll((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)))
    setShowAdd(false)
  }

  const control = 'rounded-lg bg-white px-3 py-2 text-slate-900 dark:bg-[#1b2030] dark:text-white'

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-slate-500 dark:text-slate-400">{t('nav.back')}</Link>
          <h1 className="text-xl font-bold">{t('exercises.title')}</h1>
          <button onClick={() => setShowAdd((s) => !s)} className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800">
            {t('exercises.addCustom')}
          </button>
        </div>

        {showAdd && (
          <AddExerciseForm
            userId={userId}
            muscleOptions={muscleOptions}
            equipmentOptions={equipmentOptions}
            onAdded={onAdded}
            onCancel={() => setShowAdd(false)}
          />
        )}

        <input
          className={`${control} w-full`}
          placeholder={t('exercises.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-2">
          <select className={`${control} flex-1`} value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
            <option value="all">{t('exercises.allMuscles')}</option>
            {muscleOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className={`${control} flex-1`} value={mechanic} onChange={(e) => setMechanic(e.target.value as Mechanic | 'all')}>
            <option value="all">{t('exercises.allMechanics')}</option>
            <option value="compound">{t('exercises.mechanic.compound')}</option>
            <option value="isolation">{t('exercises.mechanic.isolation')}</option>
          </select>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">…</p>
        ) : (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('exercises.countShown').replace('{shown}', String(filtered.length)).replace('{total}', String(all.length))}
            </p>
            {filtered.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{t('exercises.empty')}</p>}
            <ul className="space-y-2">
              {filtered.map((e) => (
                <li key={e.id} className="rounded-lg bg-slate-100 p-3 dark:bg-[#1b2030]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{e.name}</span>
                    {e.owner_user_id && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{t('exercises.custom')}</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {e.muscle_group}{e.equipment ? ` · ${e.equipment}` : ''}{e.mechanic ? ` · ${t(`exercises.mechanic.${e.mechanic}`)}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function AddExerciseForm({
  userId, muscleOptions, equipmentOptions, onAdded, onCancel,
}: {
  userId: string
  muscleOptions: string[]
  equipmentOptions: string[]
  onAdded: (row: ExerciseRow) => void
  onCancel: () => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  const [muscleGroup, setMuscleGroup] = useState(muscleOptions[0] ?? 'chest')
  const [equipment, setEquipment] = useState(equipmentOptions[0] ?? '')
  const [mechanic, setMechanic] = useState<Mechanic>('compound')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const control = 'w-full rounded-lg bg-white px-3 py-2 text-slate-900 dark:bg-[#0f1115] dark:text-white'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const row = await addCustomExercise(userId, {
        name: name.trim(),
        muscle_group: muscleGroup,
        equipment: equipment || null,
        mechanic,
      })
      onAdded(row)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Exercises] addCustom failed:', err)
      setError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
      <label className="block text-sm">{t('exercises.name')}
        <input className={control} required value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm">{t('exercises.muscleGroup')}
        <select className={control} value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
          {muscleOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className="block text-sm">{t('exercises.equipment')}
        <select className={control} value={equipment} onChange={(e) => setEquipment(e.target.value)}>
          <option value="">—</option>
          {equipmentOptions.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
        </select>
      </label>
      <label className="block text-sm">{t('exercises.mechanicLabel')}
        <select className={control} value={mechanic} onChange={(e) => setMechanic(e.target.value as Mechanic)}>
          <option value="compound">{t('exercises.mechanic.compound')}</option>
          <option value="isolation">{t('exercises.mechanic.isolation')}</option>
        </select>
      </label>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {saving ? t('common.saving') : t('exercises.save')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg bg-white px-4 py-2 text-slate-900 dark:bg-[#0f1115] dark:text-white">
          {t('exercises.cancel')}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Add the `/exercises` route in `src/App.tsx`** — add the import and the route inside the inner `<Routes>` (the one wrapped by `ProfileDataProvider`):

```tsx
import { ExerciseLibraryPage } from './features/exercises/ExerciseLibraryPage'
```
and inside the inner `<Routes>`, add alongside the existing `/` route:
```tsx
                <Route path="/exercises" element={<RequireOnboarding><ExerciseLibraryPage /></RequireOnboarding>} />
```

- [ ] **Step 4: Add a link to the library on the dashboard** — in `src/features/profile/DashboardPage.tsx`, add `import { Link } from 'react-router-dom'`, and in the header row place a link between the `<Wordmark />` and `<ThemeToggle />`. Change the header `div` contents to:

```tsx
        <div className="flex items-center justify-between">
          <Wordmark className="h-7" />
          <div className="flex items-center gap-3">
            <Link to="/exercises" className="text-sm font-medium text-brand-700 dark:text-brand-400">{t('nav.exercises')}</Link>
            <ThemeToggle />
          </div>
        </div>
```

- [ ] **Step 5: Verify** — `npm test` (all prior tests still green) and `npm run build` succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/features/exercises/ExerciseLibraryPage.tsx src/i18n/strings/en.json src/App.tsx src/features/profile/DashboardPage.tsx
git commit -m "feat(exercises): library page with search, filters, and custom add"
```

---

## Self-Review Notes (verified against spec §6)

- **Tagged predefined library + custom (spec §6):** lists all visible exercises (global + own via RLS), searchable by name, filterable by muscle group + mechanic; custom exercises are added private (`owner_user_id` set, `is_public=false`) and flagged with a "Custom" badge ✓.
- **Layering (spec §4):** Supabase only in `exerciseRepo`; pure filter logic unit-tested; page composes repo + pure helpers ✓.
- **i18n:** all copy keyed, including muscle/mechanic labels and the count string (token-replaced) ✓.
- **Brand/theme:** brand-colored buttons, `bg-white dark:bg-[#0f1115]` surfaces, slate-100/`#1b2030` cards — consistent with the rest of the app ✓.
- **Navigation:** dashboard links to `/exercises`; the library has a back link to `/`. (A persistent nav bar is deferred until the meso/logging screens land.)
- **Type consistency:** `ExerciseRow` defined once in `rows.ts`; `Mechanic` reused from domain; `ExerciseFilter` shape matches the page's filter state; `NewExercise` matches the add form's payload ✓.
- **Perf note:** the list renders the filtered set (≤873 light rows); virtualization deferred — acceptable at this scale, and filtering narrows it in practice.
```
