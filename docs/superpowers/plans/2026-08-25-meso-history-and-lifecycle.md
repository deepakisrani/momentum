# Meso History and Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every mesocycle's training log reachable and exportable — not just the active one — stop deletes from orphaning history, and make re-activating an old meso start a fresh training run automatically.

**Architecture:** Two nullable columns on `meso` carry the whole feature. `deleted_at` turns delete into a soft delete, so sessions are never orphaned and day-label rows survive. `activated_at` marks when the current run began; the day-scoped surfaces (deload cadence, "Previous workout") filter to it while History and the CSV export do not. History gains a meso switcher over all mesos plus an "Unassigned" bucket for sessions orphaned before soft delete existed.

**Tech Stack:** React 18 + TypeScript, Tailwind, react-router-dom, Supabase (Postgres + PostgREST + RLS), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-meso-history-and-lifecycle-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0011_meso_soft_delete_and_activation.sql` | **Create.** Two nullable columns on `meso`. |
| `src/data/rows.ts` | **Modify.** Add `deleted_at` / `activated_at` to `MesoRow`. |
| `src/data/mesoRepo.ts` | **Modify.** Soft delete, deleted-aware listings, activation stamping. |
| `src/data/sessionRepo.ts` | **Modify.** Nullable `mesoId`, `since` window, completed-session count. |
| `src/data/exportRepo.ts` | **Modify.** Nullable `mesoId`. |
| `src/features/history/historyScope.ts` | **Create.** Pure: switcher options, default scope, run split. |
| `src/features/history/historyScope.test.ts` | **Create.** Unit tests for the above. |
| `src/features/history/HistoryPage.tsx` | **Rewrite.** Switcher; export follows selection; run grouping. |
| `src/features/history/PreviousWorkoutPanel.tsx` | **Modify.** Pass the activation window. |
| `src/features/session/ActiveWorkoutPage.tsx` | **Modify.** Pass the window to day stats; pass `activated_at` to the panel. |
| `src/features/mesos/ActivationDialog.tsx` | **Create.** The three-way activation choice. |
| `src/features/mesos/ActivationDialog.test.tsx` | **Create.** Its contract. |
| `src/features/mesos/MesoListPage.tsx` | **Modify.** Route activation through the dialog. |
| `src/i18n/strings/en.json` | **Modify.** New strings, then the title-case pass. |

Order: schema and data layer first (Tasks 1–4), then the pure logic its consumers need (Task 5), then UI (Tasks 6–9), then copy (Task 10), then verification (Task 11). Every task after Task 4 leaves the app working.

**Baselines before you start:** `npx vitest run` → **324 tests / 34 files**. `npm run lint` → `✖ 9 problems (3 errors, 6 warnings)`, all pre-existing on `main` in `RequireAuth.test.tsx`, `MesoListPage.tsx`, `ExerciseLogPanel.tsx`. **Do not fix those three.** Any *additional* lint problem is yours.

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/0011_meso_soft_delete_and_activation.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Soft delete, so deleting a meso stops orphaning its training log.
--
-- Before this, `meso` rows were hard-deleted. workout_session.meso_id is `on delete set
-- null`, so sessions survived but became invisible (History requires a meso) -- and
-- meso_day.meso_id is `on delete cascade`, so the day plan was destroyed outright, taking
-- the day labels with it. A soft delete keeps the meso row, its days and its labels alive,
-- so history stays readable while the meso disappears from the Mesos page.
alter table meso add column deleted_at timestamptz;

-- When the current *run* of this meso began.
--
-- Re-activating a meso months later should behave like a new training block: no stale
-- "previous workout", and above all no deload cadence resumed from months-old sessions
-- (sessionsSinceLastDeload counts back until it finds a deload, so an abandoned meso can
-- report "Deload scheduled" on ancient data). The day-scoped queries filter to sessions on
-- or after this; History and the CSV export deliberately do not, so nothing is hidden.
alter table meso add column activated_at timestamptz;
```

Both columns are nullable and start `NULL` on existing rows. `NULL deleted_at` means not
deleted. `NULL activated_at` means no window — i.e. exactly today's behaviour — so nothing
already logged is retroactively hidden or reset.

- [ ] **Step 2: Verify it against the existing conventions**

Read `supabase/migrations/0001_initial_schema.sql` (the `meso` table), `0002_rls_policies.sql`
(the `meso_self` policy) and `0005_fk_indexes.sql` (its stated rationale for indexes). Confirm:

- No RLS change is needed — `meso_self` is `for all using (user_id = auth.uid())`, which
  already covers the new columns.
- **No index is added, deliberately.** `meso` holds a handful of rows per user, and
  `meso_self` is a direct `user_id = auth.uid()` rather than an `EXISTS` subquery, so
  `0005`'s rationale ("indexes Postgres does not auto-create" for policy subqueries) does not
  apply. Adding one would be cargo-cult. Say so in your report if you disagree.

- [ ] **Step 3: Do NOT apply it**

The user's Supabase GitHub integration applies migrations on merge. **Do not run
`supabase db push`, `supabase start`, or anything that touches a database.** Note in your
report that the migration is unapplied and that `listMesosForHistory` and the History
switcher will error until it lands.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0011_meso_soft_delete_and_activation.sql
git commit -m "feat(db): meso soft delete and activation timestamp"
```

---

## Task 2: Row type

**Files:**
- Modify: `src/data/rows.ts`

- [ ] **Step 1: Add the two fields to `MesoRow`**

Find `MesoRow` and add the fields so it reads:

```ts
export interface MesoRow {
  id: string
  user_id: string
  name: string
  deload_every_n_microcycles: number | null
  is_active: boolean
  notes: string | null
  created_at: string
  /** Set when the meso was soft-deleted. Null means live. */
  deleted_at: string | null
  /** When the current run began. Null means the meso has never been re-activated, so every
   * session it owns belongs to the current run. */
  activated_at: string | null
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc -b`
Expected: **one error**, which you must also fix:

```
src/features/mesos/mesoDraft.test.ts(11,3): error TS2739: ... is missing the following
properties from type 'MesoRow': deleted_at, activated_at
```

`MesoFull`'s test fixture is the only place in `src/` that constructs a `MesoRow` *literal*
(everything else types a query result, so the new fields simply arrive). Add both fields to it:

```ts
  meso: { id: 'm1', user_id: 'u1', name: 'June', deload_every_n_microcycles: 4, is_active: true, notes: null, created_at: '2026-06-20T00:00:00Z', deleted_at: null, activated_at: null },
```

Then `npx tsc -b` is clean. If any *other* error appears, report it rather than working around
it — it would mean another literal exists that this plan has not accounted for.

- [ ] **Step 3: Commit**

```bash
git add src/data/rows.ts src/features/mesos/mesoDraft.test.ts
git commit -m "feat(data): meso row carries deleted_at and activated_at"
```

---

## Task 3: mesoRepo — soft delete, listings, activation

**Files:**
- Modify: `src/data/mesoRepo.ts`

There are no unit tests here: these are Supabase queries, and mocking the query builder tests
the mock. That matches `exportRepo.test.ts`, which tests only its pure helper. Correctness
comes from `tsc`, from reading, and from Task 11's manual pass.

- [ ] **Step 1: Make `listMesos` deleted-aware and add the History listing**

Replace `listMesos` with these two functions:

```ts
/** Live mesos for the Mesos page, newest first. Soft-deleted ones are excluded: deleting a
 * meso should remove it from the app, and History is where its log stays readable. */
export async function listMesos(userId: string): Promise<MesoRow[]> {
  const { data, error } = await supabase
    .from('meso')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as MesoRow[]
}

/** Every meso including soft-deleted ones, newest first. History needs the deleted ones --
 * keeping their sessions readable is the whole point of soft-deleting -- which is why this is
 * a separate function rather than a flag on `listMesos`: no caller can surface a deleted meso
 * where it does not belong by forgetting an argument. */
export async function listMesosForHistory(userId: string): Promise<MesoRow[]> {
  const { data, error } = await supabase
    .from('meso')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as MesoRow[]
}
```

- [ ] **Step 2: Turn `deleteMeso` into a soft delete**

Replace `deleteMeso`:

```ts
/** Soft delete: the row stays so its sessions, days and day labels survive, and History can
 * still group by it. `is_active` is cleared for two reasons -- a deleted meso must not keep
 * driving the workout screen, and the `one_active_meso_per_user` partial unique index
 * (0001) is defined `where is_active`, so leaving it set would keep a dead meso occupying
 * that slot. There is deliberately no undelete in the UI. */
export async function deleteMeso(mesoId: string): Promise<void> {
  const { error } = await supabase
    .from('meso')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', mesoId)
  if (error) throw error
}
```

- [ ] **Step 3: Let `setActiveMeso` stamp a fresh run**

Replace `setActiveMeso`:

```ts
/** Activate a meso. `freshRun` stamps `activated_at`, which is what makes the day-scoped
 * surfaces (deload cadence, "Previous workout") ignore everything logged before now --
 * re-activating an old meso then behaves like a new block. Without it the meso is resumed:
 * activated, window untouched, cadence intact. */
export async function setActiveMeso(userId: string, mesoId: string, opts?: { freshRun?: boolean }): Promise<void> {
  const { error: e1 } = await supabase.from('meso').update({ is_active: false }).eq('user_id', userId)
  if (e1) throw e1
  const patch: { is_active: boolean; activated_at?: string } = { is_active: true }
  if (opts?.freshRun) patch.activated_at = new Date().toISOString()
  const { error: e2 } = await supabase.from('meso').update(patch).eq('id', mesoId)
  if (e2) throw e2
}
```

- [ ] **Step 4: Make `getActiveMeso` deleted-aware**

In `getActiveMeso`, add `.is('deleted_at', null)` after the `is_active` filter:

```ts
export async function getActiveMeso(userId: string): Promise<MesoRow | null> {
  const { data, error } = await supabase
    .from('meso').select('*').eq('user_id', userId).eq('is_active', true).is('deleted_at', null).maybeSingle()
  if (error) throw error
  return data as MesoRow | null
}
```

Defensive: `deleteMeso` already clears `is_active`, so a row with both should not exist. This
means a bad row degrades to "no active meso" rather than driving the workout screen from a
deleted plan.

Leave `getMesoFull` unchanged — History must be able to read a deleted meso's day labels.

- [ ] **Step 5: Verify**

Run: `npx tsc -b`
Expected: an error at `src/features/mesos/MesoListPage.tsx` only if you changed
`setActiveMeso`'s existing two-argument call — the new third parameter is optional, so the
existing call still compiles. If `tsc` is clean, good.

Run: `npx vitest run`
Expected: **324 tests / 34 files**, unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/data/mesoRepo.ts
git commit -m "feat(data): soft-delete mesos and stamp activation runs"
```

---

## Task 4: Session and export queries

**Files:**
- Modify: `src/data/sessionRepo.ts`
- Modify: `src/data/exportRepo.ts`

- [ ] **Step 1: Widen `listMesoSessions` and add the window**

Replace the signature and query build of `listMesoSessions`:

```ts
/** Completed sessions, newest first.
 *
 * `mesoId: null` is the "unassigned" bucket -- sessions whose meso was hard-deleted before
 * soft delete existed, or which were logged while no meso was active. They are otherwise
 * unreachable in the app.
 *
 * `since` is the activation window: pass a meso's `activated_at` to see only its current
 * run. History deliberately passes nothing, so it can show every run. */
export async function listMesoSessions(
  userId: string,
  mesoId: string | null,
  opts?: { mesoDayId?: string; since?: string | null },
): Promise<SessionSummary[]> {
  let q = supabase
    .from('workout_session')
    .select('id, meso_day_id, started_at, ended_at, is_deload, session_exercise(count)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
  q = mesoId === null ? q.is('meso_id', null) : q.eq('meso_id', mesoId)
  if (opts?.mesoDayId) q = q.eq('meso_day_id', opts.mesoDayId)
  if (opts?.since) q = q.gte('started_at', opts.since)
  const { data, error } = await q
  if (error) throw error
  type Raw = { id: string; meso_day_id: string | null; started_at: string; ended_at: string | null; is_deload: boolean; session_exercise: { count: number }[] }
  return ((data ?? []) as Raw[]).map((r) => ({
    id: r.id,
    meso_day_id: r.meso_day_id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    is_deload: r.is_deload,
    exerciseCount: Number(r.session_exercise?.[0]?.count ?? 0),
  }))
}
```

- [ ] **Step 2: Add the completed-session count**

Add to `src/data/sessionRepo.ts`, next to `listMesoSessions`:

```ts
/** How many completed sessions belong to a meso -- or to no meso at all when `mesoId` is
 * null. Two callers: History asks about null to decide whether to offer an "Unassigned"
 * entry, and the Mesos page asks about a meso to decide whether activating it needs the
 * fresh-run/resume question at all (a meso nobody has trained has nothing to preserve). */
export async function countCompletedSessions(userId: string, mesoId: string | null): Promise<number> {
  let q = supabase
    .from('workout_session')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed')
  q = mesoId === null ? q.is('meso_id', null) : q.eq('meso_id', mesoId)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}
```

The spec called this `countUnassignedSessions`. One function parameterised by `mesoId`
serves both callers with the same null-vs-eq convention `listMesoSessions` already uses, so
it is the version to build. Note the divergence in your report.

- [ ] **Step 3: Window the day stats**

`getMesoDayStats` drives the "Last workout" date and the deload counter. Add the window:

```ts
/** Per meso_day: most recent completed-session date + sessions since the last actual deload.
 *
 * `since` is the meso's `activated_at`. It matters most for the deload count: without it,
 * re-activating a meso abandoned four sessions past its last deload immediately reports
 * "Deload scheduled" on the strength of months-old sessions. */
export async function getMesoDayStats(userId: string, mesoId: string, since?: string | null): Promise<Record<string, MesoDayStat>> {
  let q = supabase
    .from('workout_session')
    .select('meso_day_id, started_at, ended_at, is_deload')
    .eq('user_id', userId)
    .eq('meso_id', mesoId)
    .eq('status', 'completed')
    .not('meso_day_id', 'is', null)
    .order('started_at', { ascending: false })
  if (since) q = q.gte('started_at', since)
  const { data, error } = await q
  if (error) throw error
```

Leave the rest of the function body exactly as it is.

- [ ] **Step 4: Widen the export**

In `src/data/exportRepo.ts`, change `getMesoSetRows` so the meso filter matches:

```ts
/** Fetch all completed logged sets for one meso in a single nested query. `mesoId: null`
 * exports the unassigned bucket. Deliberately not windowed by `activated_at` -- an export
 * should contain everything the meso owns, every run of it. */
export async function getMesoSetRows(userId: string, mesoId: string | null): Promise<MesoSetRow[]> {
  let q = supabase
    .from('workout_session')
    .select(
      'started_at, is_deload, meso_day_id, meso_day ( label ), session_exercise ( order_index, exercise ( name, muscle_group ), logged_set ( set_index, set_segment ( segment_index, weight, reps, rir ) ) )',
    )
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('started_at', { ascending: true })
  q = mesoId === null ? q.is('meso_id', null) : q.eq('meso_id', mesoId)
  const { data, error } = await q
  if (error) throw error
  return flattenMesoQuery((data ?? []) as unknown as QSession[])
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc -b`
Expected: no output. All three widened parameters are backward compatible — existing callers
pass a `string`, which still satisfies `string | null`.

Run: `npx vitest run`
Expected: **324 tests / 34 files**, unchanged. `exportRepo.test.ts` tests `flattenMesoQuery`,
which you did not touch.

- [ ] **Step 6: Commit**

```bash
git add src/data/sessionRepo.ts src/data/exportRepo.ts
git commit -m "feat(data): unassigned-session scope and activation windows"
```

---

## Task 5: Pure history-scope logic

**Files:**
- Create: `src/features/history/historyScope.ts`
- Test: `src/features/history/historyScope.test.ts`

This is the only genuinely testable logic in the feature, so it gets real TDD. Deliberately
i18n-free: options carry `mesoName: null` for the unassigned entry and the component supplies
the label, so these functions can be tested without a provider.

- [ ] **Step 1: Write the failing test**

Create `src/features/history/historyScope.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { historyScopeOptions, defaultHistoryScope, scopeKey, splitByRun, UNASSIGNED_KEY } from './historyScope'
import type { MesoRow } from '../../data/rows'

function meso(id: string, name: string, opts?: { active?: boolean; deleted?: boolean; activatedAt?: string }): MesoRow {
  return {
    id, user_id: 'u1', name,
    deload_every_n_microcycles: null,
    is_active: opts?.active ?? false,
    notes: null,
    created_at: `2026-0${id.length}-01T00:00:00Z`,
    deleted_at: opts?.deleted ? '2026-08-01T00:00:00Z' : null,
    activated_at: opts?.activatedAt ?? null,
  }
}

describe('scopeKey', () => {
  it('is the meso id, or a fixed key for unassigned', () => {
    expect(scopeKey({ kind: 'meso', mesoId: 'm1' })).toBe('m1')
    expect(scopeKey({ kind: 'unassigned' })).toBe(UNASSIGNED_KEY)
  })
})

describe('historyScopeOptions', () => {
  it('lists mesos in the order given, deleted ones included', () => {
    const out = historyScopeOptions([meso('m1', 'Push/Pull'), meso('m2', 'Upper/Lower', { deleted: true })], false)
    expect(out.map((o) => o.mesoName)).toEqual(['Push/Pull', 'Upper/Lower'])
    expect(out.map((o) => o.key)).toEqual(['m1', 'm2'])
  })

  it('appends unassigned only when orphans exist', () => {
    expect(historyScopeOptions([meso('m1', 'A')], false).map((o) => o.key)).toEqual(['m1'])
    const withOrphans = historyScopeOptions([meso('m1', 'A')], true)
    expect(withOrphans.map((o) => o.key)).toEqual(['m1', UNASSIGNED_KEY])
    expect(withOrphans[1].mesoName).toBeNull()
    expect(withOrphans[1].scope).toEqual({ kind: 'unassigned' })
  })

  it('can offer unassigned as the only option', () => {
    const out = historyScopeOptions([], true)
    expect(out.map((o) => o.key)).toEqual([UNASSIGNED_KEY])
  })

  it('returns [] when there is nothing at all', () => {
    expect(historyScopeOptions([], false)).toEqual([])
  })
})

describe('defaultHistoryScope', () => {
  it('prefers the active meso even when it is not the newest', () => {
    const out = defaultHistoryScope([meso('m1', 'Newest'), meso('m22', 'Older', { active: true })], false)
    expect(out).toEqual({ kind: 'meso', mesoId: 'm22' })
  })

  it('falls back to the first meso when none is active', () => {
    expect(defaultHistoryScope([meso('m1', 'A'), meso('m22', 'B')], false)).toEqual({ kind: 'meso', mesoId: 'm1' })
  })

  it('falls back to unassigned when there are no mesos', () => {
    expect(defaultHistoryScope([], true)).toEqual({ kind: 'unassigned' })
  })

  it('is null when there is nothing to show', () => {
    expect(defaultHistoryScope([], false)).toBeNull()
  })

  it('does not skip a deleted meso -- a deleted meso is still readable history', () => {
    expect(defaultHistoryScope([meso('m1', 'Gone', { deleted: true })], false)).toEqual({ kind: 'meso', mesoId: 'm1' })
  })
})

describe('splitByRun', () => {
  const sessions = [
    { id: 'c', started_at: '2026-08-20T10:00:00Z' },
    { id: 'b', started_at: '2026-08-10T10:00:00Z' },
    { id: 'a', started_at: '2026-06-01T10:00:00Z' },
  ]

  it('treats everything as current when the meso was never re-activated', () => {
    const out = splitByRun(sessions, null)
    expect(out.current.map((s) => s.id)).toEqual(['c', 'b', 'a'])
    expect(out.earlier).toEqual([])
  })

  it('splits at the activation timestamp', () => {
    const out = splitByRun(sessions, '2026-08-15T00:00:00Z')
    expect(out.current.map((s) => s.id)).toEqual(['c'])
    expect(out.earlier.map((s) => s.id)).toEqual(['b', 'a'])
  })

  it('counts a session exactly on the boundary as current', () => {
    const out = splitByRun(sessions, '2026-08-10T10:00:00Z')
    expect(out.current.map((s) => s.id)).toEqual(['c', 'b'])
    expect(out.earlier.map((s) => s.id)).toEqual(['a'])
  })

  it('can put everything in earlier', () => {
    const out = splitByRun(sessions, '2026-09-01T00:00:00Z')
    expect(out.current).toEqual([])
    expect(out.earlier.map((s) => s.id)).toEqual(['c', 'b', 'a'])
  })

  it('preserves input order within each group and does not mutate the input', () => {
    const input = [...sessions]
    const out = splitByRun(input, '2026-08-15T00:00:00Z')
    expect(input.map((s) => s.id)).toEqual(['c', 'b', 'a'])
    expect(out.current).not.toBe(input)
  })

  it('is safe on an empty list', () => {
    expect(splitByRun([], '2026-08-15T00:00:00Z')).toEqual({ current: [], earlier: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/history/historyScope.test.ts`
Expected: FAIL — `Failed to resolve import "./historyScope"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/history/historyScope.ts`:

```ts
import type { MesoRow } from '../../data/rows'

/** What History is showing: one meso, or the sessions that belong to no meso. */
export type HistoryScope = { kind: 'meso'; mesoId: string } | { kind: 'unassigned' }

export interface ScopeOption {
  /** Stable key for React and for `<select>` values. */
  key: string
  scope: HistoryScope
  /** Null for the unassigned entry: the caller supplies its translated label, which keeps
   * this module free of i18n and testable without a provider. */
  mesoName: string | null
}

export const UNASSIGNED_KEY = '__unassigned__'

export function scopeKey(scope: HistoryScope): string {
  return scope.kind === 'meso' ? scope.mesoId : UNASSIGNED_KEY
}

/** Switcher options in the order `mesos` was given (newest first, per `listMesosForHistory`).
 * Soft-deleted mesos are included on purpose -- keeping their log readable is why they are
 * soft-deleted -- and carry no marker, because to History they are simply another block of
 * training. Unassigned is appended only when orphaned sessions actually exist, so the entry
 * never appears for a user who has none. */
export function historyScopeOptions(mesos: MesoRow[], hasUnassigned: boolean): ScopeOption[] {
  const out: ScopeOption[] = mesos.map((m) => ({ key: m.id, scope: { kind: 'meso', mesoId: m.id }, mesoName: m.name }))
  if (hasUnassigned) out.push({ key: UNASSIGNED_KEY, scope: { kind: 'unassigned' }, mesoName: null })
  return out
}

/** Active meso, else the newest, else unassigned, else nothing to show. */
export function defaultHistoryScope(mesos: MesoRow[], hasUnassigned: boolean): HistoryScope | null {
  const active = mesos.find((m) => m.is_active)
  if (active) return { kind: 'meso', mesoId: active.id }
  if (mesos.length > 0) return { kind: 'meso', mesoId: mesos[0].id }
  if (hasUnassigned) return { kind: 'unassigned' }
  return null
}

/** Split a meso's sessions at the start of its current run.
 *
 * A session exactly on the boundary counts as current: `activated_at` is the moment the run
 * began, so a workout stamped identically belongs to it. `null` means the meso has never been
 * re-activated, so everything it owns is the current run.
 *
 * A single timestamp cannot separate three or more runs -- every block before the latest
 * activation lands in `earlier` together. Accepted when the column was chosen. */
export function splitByRun<T extends { started_at: string }>(
  sessions: T[],
  activatedAt: string | null,
): { current: T[]; earlier: T[] } {
  if (!activatedAt) return { current: [...sessions], earlier: [] }
  const current: T[] = []
  const earlier: T[] = []
  for (const s of sessions) (s.started_at >= activatedAt ? current : earlier).push(s)
  return { current, earlier }
}
```

ISO-8601 UTC timestamps compare correctly as strings, which is why `>=` is enough — the same
assumption `listMesoSessions` already relies on for `.order('started_at')`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/history/historyScope.test.ts`
Expected: PASS — 17 tests.

- [ ] **Step 5: Think adversarially and add what you find**

Every task in this project's previous plans shipped at least one bug traceable to an
implementer transcribing plan code faithfully. Before committing, hunt for cases the tests
above miss, and add a test for anything real. Consider at least: a meso list containing two
mesos both flagged `is_active` (the DB index should prevent it — what does `defaultHistoryScope`
do?); `activated_at` set to an empty string rather than null; a `sessions` array that is not
sorted; and whether `historyScopeOptions` can ever produce duplicate keys. Report anything you
choose not to fix, with reasoning.

- [ ] **Step 6: Commit**

```bash
git add src/features/history/historyScope.ts src/features/history/historyScope.test.ts
git commit -m "feat(history): pure scope options, default scope and run split"
```

---

## Task 6: New i18n strings

**Files:**
- Modify: `src/i18n/strings/en.json`

The title-case pass is Task 10; this task only adds what the new UI needs.

- [ ] **Step 1: Add the keys**

Add to `src/i18n/strings/en.json` (flat object, position irrelevant):

```json
  "history.mesoScope": "Showing",
  "history.unassigned": "Unassigned workouts",
  "history.currentRun": "Current run",
  "history.earlier": "Earlier runs",
  "history.emptyScope": "No workouts logged in this mesocycle.",
  "mesos.activateTitle": "Start a fresh run?",
  "mesos.activateBody": "A fresh run restarts the deload count and clears \"previous workout\", so this block begins clean. Your earlier sessions stay in History either way.",
  "mesos.activateFresh": "Start Fresh Run",
  "mesos.activateResume": "Resume Previous Run",
```

`history.emptyScope` is one key more than the spec listed: the spec kept `history.empty` for
the page-level empty state, but Task 7 makes the empty state per-scope ("no workouts in *this*
mesocycle"), which needs its own wording. Noted rather than silently added.

Check the file's existing conventions first (curly vs straight apostrophes, em dashes) and
match them; report anything you adjusted. The two button labels are title case because Task 10
makes that the convention for action labels — they are written correctly from the start rather
than fixed later.

- [ ] **Step 2: Verify the JSON still parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/strings/en.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/i18n/strings/en.json
git commit -m "feat(i18n): history scope and activation strings"
```

---

## Task 7: History page — the switcher

**Files:**
- Rewrite: `src/features/history/HistoryPage.tsx`

No page test: `HistoryPage` needs a router, auth and Supabase, and this repo has no
page-level tests. The logic worth testing is already in `historyScope.ts` (Task 5). Be
rigorous by inspection, because nothing will catch you.

- [ ] **Step 1: Replace the file**

Replace `src/features/history/HistoryPage.tsx` entirely:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { listMesosForHistory, getMesoFull } from '../../data/mesoRepo'
import { listMesoSessions, countCompletedSessions, type SessionSummary } from '../../data/sessionRepo'
import { getMesoSetRows } from '../../data/exportRepo'
import { mesoRowsToCsv } from './mesoCsv'
import { downloadTextFile } from '../../lib/download'
import { useUnits } from '../profile/useUnits'
import type { MesoRow } from '../../data/rows'
import { shortDate, localIsoDate } from './historyFormat'
import {
  defaultHistoryScope, historyScopeOptions, scopeKey, splitByRun, type HistoryScope,
} from './historyScope'

/** Filename slug for the unassigned bucket, which has no meso name to slugify. */
const UNASSIGNED_SLUG = 'unassigned'

export function HistoryPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const { weightLabel, toWeight } = useUnits()
  const [mesos, setMesos] = useState<MesoRow[] | null>(null)
  const [hasUnassigned, setHasUnassigned] = useState(false)
  const [scope, setScope] = useState<HistoryScope | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [dayLabels, setDayLabels] = useState<Record<string, string>>({})
  const [error, setError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)

  // What the user can look at: every meso including soft-deleted ones (keeping their log
  // readable is the point of soft-deleting), plus whether any workout belongs to no meso.
  useEffect(() => {
    if (!userId) return
    let ignore = false
    ;(async () => {
      const [ms, orphans] = await Promise.all([
        listMesosForHistory(userId),
        countCompletedSessions(userId, null),
      ])
      if (ignore) return
      setMesos(ms)
      setHasUnassigned(orphans > 0)
      setScope(defaultHistoryScope(ms, orphans > 0))
    })().catch(() => { if (!ignore) { setError(true); setMesos([]) } })
    return () => { ignore = true }
  }, [userId])

  // Sessions for the selected scope. Day labels come from the meso's own day rows, which
  // soft delete preserves; the unassigned bucket has no meso and therefore no labels.
  useEffect(() => {
    if (!scope) return
    let ignore = false
    setSessions(null)
    ;(async () => {
      if (scope.kind === 'unassigned') {
        const list = await listMesoSessions(userId, null)
        if (!ignore) { setDayLabels({}); setSessions(list) }
        return
      }
      const [full, list] = await Promise.all([
        getMesoFull(scope.mesoId),
        listMesoSessions(userId, scope.mesoId),
      ])
      if (!ignore) {
        setDayLabels(Object.fromEntries(full.days.map((d) => [d.id, d.label])))
        setSessions(list)
      }
    })().catch(() => { if (!ignore) { setError(true); setSessions([]) } })
    return () => { ignore = true }
  }, [userId, scope])

  const options = useMemo(() => historyScopeOptions(mesos ?? [], hasUnassigned), [mesos, hasUnassigned])
  const selectedMeso = scope?.kind === 'meso'
    ? (mesos ?? []).find((m) => m.id === scope.mesoId) ?? null
    : null
  // Only a meso has runs. History is deliberately NOT windowed -- it shows every run and
  // groups them -- which is why the split happens here rather than in the query.
  const runs = splitByRun(sessions ?? [], selectedMeso?.activated_at ?? null)

  async function onExport() {
    if (!scope) return
    setExporting(true)
    setExportError(false)
    try {
      // The export follows the switcher, not the active meso. Before this, switching meso
      // meant you could no longer export what came before it.
      const rows = await getMesoSetRows(userId, scope.kind === 'meso' ? scope.mesoId : null)
      const csv = mesoRowsToCsv(rows, weightLabel, toWeight, localIsoDate)
      const base = selectedMeso?.name ?? UNASSIGNED_SLUG
      const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'meso'
      const date = new Date().toISOString().slice(0, 10)
      downloadTextFile(`momentum-${slug}-${date}.csv`, csv)
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  if (mesos === null) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>
  }

  const control = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white'

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-4xl space-y-3">
        {error && <p className="text-sm text-red-500">{t('common.error')}</p>}

        {options.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.noActiveMeso')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 dark:text-slate-400">{t('history.mesoScope')}</span>
                <select
                  className={control}
                  value={scope ? scopeKey(scope) : ''}
                  onChange={(e) => {
                    const next = options.find((o) => o.key === e.target.value)
                    if (next) setScope(next.scope)
                  }}
                >
                  {options.map((o) => (
                    <option key={o.key} value={o.key}>{o.mesoName ?? t('history.unassigned')}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                {exportError && <span className="text-xs text-red-500">{t('common.error')}</span>}
                <button
                  onClick={onExport}
                  disabled={exporting || !sessions || sessions.length === 0}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 dark:bg-[#1b2030]"
                >
                  {exporting ? t('history.exporting') : t('history.exportCsv')}
                </button>
              </div>
            </div>

            {sessions === null ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.emptyScope')}</p>
            ) : (
              <>
                <SessionGrid
                  sessions={runs.current}
                  dayLabels={dayLabels}
                  heading={runs.earlier.length > 0 ? t('history.currentRun') : null}
                  onOpen={(id) => navigate(`/history/${id}`)}
                />
                {runs.earlier.length > 0 && (
                  <SessionGrid
                    sessions={runs.earlier}
                    dayLabels={dayLabels}
                    heading={t('history.earlier')}
                    onOpen={(id) => navigate(`/history/${id}`)}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** One group of session cards, with an optional heading. Two groups appear only when a meso
 * has been re-activated, so an un-revisited meso looks exactly as it did before. */
function SessionGrid({ sessions, dayLabels, heading, onOpen }: {
  sessions: SessionSummary[]
  dayLabels: Record<string, string>
  heading: string | null
  onOpen: (sessionId: string) => void
}) {
  const t = useT()
  if (sessions.length === 0) return null
  return (
    <div className="space-y-2">
      {heading && <h2 className="text-xs font-semibold uppercase text-slate-400">{heading}</h2>}
      <div className="grid gap-2 sm:grid-cols-2">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpen(s.id)}
            className="flex w-full items-center justify-between rounded-xl bg-slate-100 px-4 py-3 text-left dark:bg-[#1b2030]"
          >
            <div>
              {/* An unassigned session shows "—": its meso_day_id was nulled when the old
                  hard delete cascaded meso_day away, and those rows cannot be recovered. */}
              <div className="font-semibold">{s.meso_day_id ? dayLabels[s.meso_day_id] ?? '—' : '—'}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {shortDate(s.started_at)} · {s.exerciseCount} {t('history.exercises')}
              </div>
            </div>
            {s.is_deload && (
              <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{t('history.deload')}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Check what you just changed about behaviour**

Three differences from the old page, all intended — confirm each by reading:

1. The old page showed `history.noActiveMeso` when there was no *active* meso. It now shows
   that only when there is nothing to show at all (no mesos, no orphans). A user with only
   inactive mesos previously saw an empty screen; now they see their history.
2. `history.empty` is no longer used by this page; the per-scope empty state is
   `history.emptyScope`. Leave `history.empty` in `en.json` — Task 10 does not remove keys.
3. Export is disabled when the selected scope has no sessions, which the old page achieved
   implicitly by not rendering the button at all.

- [ ] **Step 3: Verify**

Run: `npx tsc -b`
Expected: no output.

Run: `npx vitest run`
Expected: **324 + your Task 5 tests**, all passing.

Run: `npm run lint`
Expected: the baseline `✖ 9 problems (3 errors, 6 warnings)` and nothing more. Watch
specifically for a new `react-hooks/exhaustive-deps` warning on either effect.

- [ ] **Step 4: Commit**

```bash
git add src/features/history/HistoryPage.tsx
git commit -m "feat(history): meso switcher, unassigned bucket, export follows selection"
```

---

## Task 8: Apply the activation window

**Files:**
- Modify: `src/features/session/ActiveWorkoutPage.tsx`
- Modify: `src/features/history/PreviousWorkoutPanel.tsx`

- [ ] **Step 1: Window the day stats**

In `src/features/session/ActiveWorkoutPage.tsx`, find the line inside the initial load effect:

```tsx
          setDayStats(await getMesoDayStats(userId, meso.id))
```

Replace it with:

```tsx
          // Windowed to the meso's current run, so re-activating an old meso does not resume
          // its deload cadence from months-old sessions.
          setDayStats(await getMesoDayStats(userId, meso.id, meso.activated_at))
```

- [ ] **Step 2: Give the previous-workout panel the window**

In `src/features/history/PreviousWorkoutPanel.tsx`, add `since` to the props type and pass it
through. The props become:

```tsx
export function PreviousWorkoutPanel({ userId, mesoId, mesoDayId, dayLabel, since, onClose }: {
  userId: string
  mesoId: string
  mesoDayId: string
  dayLabel: string
  /** The meso's `activated_at`. Only the current run is "previous" -- a session from before
   * the meso was re-activated belongs to an earlier block, and History is where those live. */
  since: string | null
  onClose: () => void
}) {
```

and the load effect becomes:

```tsx
  useEffect(() => {
    listMesoSessions(userId, mesoId, { mesoDayId, since }).then(setSessions).catch(() => setSessions([]))
  }, [userId, mesoId, mesoDayId, since])
```

- [ ] **Step 3: Pass it from the workout page**

In `ActiveWorkoutPage.tsx`, find the `<PreviousWorkoutPanel .../>` render. It sits inside a
narrowing guard — `{historyOpen && full.session.meso_id && full.session.meso_day_id && (…)}` —
which is what makes those two props `string` rather than `string | null`. **Keep that guard**;
add the one prop to the element inside it:

```tsx
        <PreviousWorkoutPanel
          userId={userId}
          mesoId={full.session.meso_id}
          mesoDayId={full.session.meso_day_id}
          dayLabel={dayLabel}
          since={activeMeso?.activated_at ?? null}
          onClose={() => setHistoryOpen(false)}
        />
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b`
Expected: no output. If it complains that `since` is missing at the call site, you have only
done Step 2 — finish Step 3.

Run: `npx vitest run`
Expected: unchanged from Task 7.

Run: `npm run lint`
Expected: the baseline, and no new `exhaustive-deps` warning (`since` is in the dep array).

- [ ] **Step 5: Commit**

```bash
git add src/features/session/ActiveWorkoutPage.tsx src/features/history/PreviousWorkoutPanel.tsx
git commit -m "feat(workout): scope day stats and previous workout to the current run"
```

---

## Task 9: Activation dialog

**Files:**
- Create: `src/features/mesos/ActivationDialog.tsx`
- Test: `src/features/mesos/ActivationDialog.test.tsx`
- Modify: `src/features/mesos/MesoListPage.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/mesos/ActivationDialog.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ActivationDialog } from './ActivationDialog'

function setup(busy = false) {
  const onFreshRun = vi.fn()
  const onResume = vi.fn()
  const onCancel = vi.fn()
  const utils = render(
    <ActivationDialog mesoName="Push/Pull" busy={busy} onFreshRun={onFreshRun} onResume={onResume} onCancel={onCancel} />
  )
  return { onFreshRun, onResume, onCancel, ...utils }
}

describe('ActivationDialog', () => {
  it('names the meso being activated', () => {
    setup()
    expect(screen.getByText('Push/Pull')).toBeInTheDocument()
  })

  it('offers all three outcomes', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Start Fresh Run' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume Previous Run' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('fires exactly one callback per choice', async () => {
    const user = userEvent.setup()
    const { onFreshRun, onResume, onCancel } = setup()
    await user.click(screen.getByRole('button', { name: 'Start Fresh Run' }))
    expect(onFreshRun).toHaveBeenCalledTimes(1)
    expect(onResume).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('resume is a distinct outcome from fresh run', async () => {
    const user = userEvent.setup()
    const { onFreshRun, onResume } = setup()
    await user.click(screen.getByRole('button', { name: 'Resume Previous Run' }))
    expect(onResume).toHaveBeenCalledTimes(1)
    expect(onFreshRun).not.toHaveBeenCalled()
  })

  it('disables every choice while busy, so a double tap cannot activate twice', async () => {
    const user = userEvent.setup()
    const { onFreshRun, onResume, onCancel } = setup(true)
    for (const name of ['Start Fresh Run', 'Resume Previous Run', 'Cancel']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
      await user.click(screen.getByRole('button', { name }))
    }
    expect(onFreshRun).not.toHaveBeenCalled()
    expect(onResume).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels on a backdrop click but not on a click inside the card', async () => {
    const user = userEvent.setup()
    const { onCancel, container } = setup()
    await user.click(screen.getByText('Push/Pull'))
    expect(onCancel).not.toHaveBeenCalled()
    const backdrop = container.firstElementChild as HTMLElement
    await user.click(backdrop)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not cancel when a drag that began inside the card ends on the backdrop', () => {
    const { onCancel, container } = setup()
    const backdrop = container.firstElementChild as HTMLElement
    // Such a drag dispatches click at the two nodes' common ancestor -- the backdrop -- so it
    // never traverses the card and stopPropagation cannot see it.
    fireEvent.mouseDown(screen.getByText('Push/Pull'))
    fireEvent.click(backdrop)
    expect(onCancel).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/mesos/ActivationDialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./ActivationDialog"`.

- [ ] **Step 3: Write the component**

Create `src/features/mesos/ActivationDialog.tsx`:

```tsx
import { useRef } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

/** The three-way choice when activating a meso that already has logged sessions.
 *
 * Two buttons cannot express this. "Start fresh run? / Cancel" breaks the exact case the
 * dialog exists for: with a meso four sessions into a block, an accidental switch away and
 * back leaves the user choosing between resetting their deload cadence (confirm) and leaving
 * the wrong meso active (cancel). Resume is the third outcome, and it is the important one.
 *
 * Backdrop dismissal requires the gesture to have started on the backdrop, the same guard
 * NoteEditorSheet and LogWeightModal carry: a drag beginning inside the card and ending
 * outside dispatches `click` at their common ancestor -- the backdrop -- without ever
 * traversing the card. */
export function ActivationDialog({ mesoName, busy, onFreshRun, onResume, onCancel }: {
  mesoName: string
  busy: boolean
  onFreshRun: () => void
  onResume: () => void
  onCancel: () => void
}) {
  const t = useT()
  useBodyScrollLock()
  const startedOnBackdrop = useRef(false)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => { startedOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && startedOnBackdrop.current && !busy) onCancel() }}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 text-slate-900 dark:bg-[#1b2030] dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold">{t('mesos.activateTitle')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{mesoName}</p>
        </div>
        <p className="text-sm">{t('mesos.activateBody')}</p>
        <div className="space-y-2">
          <button type="button" disabled={busy} onClick={onFreshRun} className="w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
            {t('mesos.activateFresh')}
          </button>
          <button type="button" disabled={busy} onClick={onResume} className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold disabled:opacity-60 dark:bg-[#0f1115]">
            {t('mesos.activateResume')}
          </button>
          <button type="button" disabled={busy} onClick={onCancel} className="w-full px-4 py-2 text-sm font-semibold text-slate-500 disabled:opacity-60 dark:text-slate-400">
            {t('exercises.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/mesos/ActivationDialog.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 5: Wire it into the Mesos page**

In `src/features/mesos/MesoListPage.tsx`:

Add to the imports:

```tsx
import { countCompletedSessions } from '../../data/sessionRepo'
import { ActivationDialog } from './ActivationDialog'
```

Add state next to `pendingDelete`:

```tsx
  const [pendingActivate, setPendingActivate] = useState<MesoRow | null>(null)
```

Replace the existing `activate` function with these two:

```tsx
  /** Activating a meso that nobody has trained has nothing to preserve -- no previous run, no
   * deload cadence -- so it activates straight away and the question is never asked. */
  async function onActivateClick(m: MesoRow) {
    setBusy(true)
    try {
      const trained = await countCompletedSessions(userId, m.id)
      if (trained === 0) {
        await setActiveMeso(userId, m.id)
        await reload()
        return
      }
      setPendingActivate(m)
    } catch { setError(t('common.error')) } finally { setBusy(false) }
  }

  async function activate(id: string, freshRun: boolean) {
    setBusy(true)
    try {
      await setActiveMeso(userId, id, { freshRun })
      await reload()
    } catch { setError(t('common.error')) } finally { setBusy(false) }
  }
```

Change the activate button's handler:

```tsx
                  {!m.is_active && <button disabled={busy} onClick={() => onActivateClick(m)} className="rounded-lg bg-brand-700 px-3 py-1.5 font-medium text-white hover:bg-brand-800 disabled:opacity-60">{t('mesos.activate')}</button>}
```

And render the dialog beside the existing delete confirmation, inside the outer `<div>`:

```tsx
      {pendingActivate && (
        <ActivationDialog
          mesoName={pendingActivate.name}
          busy={busy}
          onFreshRun={() => { const id = pendingActivate.id; setPendingActivate(null); void activate(id, true) }}
          onResume={() => { const id = pendingActivate.id; setPendingActivate(null); void activate(id, false) }}
          onCancel={() => setPendingActivate(null)}
        />
      )}
```

Clearing `pendingActivate` before the await, exactly as the delete confirmation already does,
is what stops a double tap from activating twice.

- [ ] **Step 6: Verify**

Run: `npx vitest run`
Expected: all passing, including your 7 new tests.

Run: `npx tsc -b`
Expected: no output.

Run: `npm run lint`
Expected: the baseline `✖ 9 problems (3 errors, 6 warnings)`. Note `MesoListPage.tsx:26`
carries one of the three pre-existing errors (`'e' is defined but never used`) — **leave it
alone**, even though you are editing this file.

- [ ] **Step 7: Commit**

```bash
git add src/features/mesos/ActivationDialog.tsx src/features/mesos/ActivationDialog.test.tsx src/features/mesos/MesoListPage.tsx
git commit -m "feat(mesos): fresh-run or resume when activating a trained meso"
```

---

## Task 10: Title-case action labels

**Files:**
- Modify: `src/i18n/strings/en.json`

The convention: **action labels are title case; prose is sentence case.** Action labels are
what appears on a button or a menu action, including the accessible name of an icon-only
button. Prose — field labels, headings, status text, option values, placeholders, hints,
confirmations, errors — is untouched.

- [ ] **Step 1: Change exactly these 31 values**

| Key | From | To |
|---|---|---|
| `auth.signOut` | Sign out | Sign Out |
| `onboarding.submit` | Finish setup | Finish Setup |
| `dashboard.changeGoal` | Change goal | Change Goal |
| `exercises.addCustom` | Add exercise | Add Exercise |
| `exercises.save` | Save exercise | Save Exercise |
| `mesos.new` | New meso | New Meso |
| `mesos.activate` | Make active | Make Active |
| `meso.addDay` | Add day | Add Day |
| `meso.removeDay` | Remove day | Remove Day |
| `meso.addExercise` | Add exercise | Add Exercise |
| `meso.save` | Save meso | Save Meso |
| `meso.saveActivate` | Save & activate | Save & Activate |
| `meso.moveUp` | Move up | Move Up |
| `meso.moveDown` | Move down | Move Down |
| `workout.start` | Start workout | Start Workout |
| `workout.resume` | Resume workout | Resume Workout |
| `workout.previous` | Previous workout | Previous Workout |
| `workout.addExercise` | Add exercise | Add Exercise |
| `workout.removeExercise` | Remove exercise | Remove Exercise |
| `workout.endWorkout` | End workout | End Workout |
| `workout.keepGoing` | Keep going | Keep Going |
| `workout.addSet` | Add set | Add Set |
| `workout.deleteSet` | Delete set | Delete Set |
| `settings.manageInvites` | Manage invites | Manage Invites |
| `invite.remove` | Remove invite | Remove Invite |
| `install.settings` | Install app | Install App |
| `metrics.typeValue` | Type value | Type Value |
| `metrics.useWheel` | Use wheel | Use Wheel |
| `notes.new` | New note | New Note |
| `notes.addExercise` | Tag exercise | Tag Exercise |
| `notes.removeTag` | Remove tag | Remove Tag |

- [ ] **Step 2: Leave these alone, deliberately**

These matched a naive "action-ish" search but are **not** action labels. Changing them would
be wrong:

- **Status text:** `workout.status.not_started` ("Not started"), `workout.status.in_progress`,
  `workout.inProgress`, `workout.exerciseDone`, `workout.deloadScheduled`,
  `nutrition.onTarget`.
- **Hints and messages:** `workout.saveFailed` ("Couldn't save — edit to retry"), all three
  `workout.suggestion.*`, `metrics.weightWheelHint`, `notes.noTags`.
- **Field labels:** `onboarding.dob`, `onboarding.weight`, `dashboard.currentWeight`,
  `exercises.muscleGroup`, `meso.name`, `meso.dayLabel`, `meso.deloadEvery`, `meso.repMin`,
  `meso.repMax`, `settings.chartLine`, `settings.deload`, `settings.protein`.
- **Headings and titles:** `onboarding.title`, `workout.allSetsDoneTitle`, `mesos.editTitle`,
  `metrics.weightTrend`, `nutrition.breakupTitle`, `history.previousTitle`.
- **Option values:** all `activity.*`, `settings.units.*`, `settings.proteinAuto`,
  `exercises.allMuscles`, `exercises.allMechanics`, `progress.range.*`.
- **Placeholders:** `exercises.search`, `progress.search`.
- **Descriptive accessible names, not action names:** `theme.toggle`
  ("Toggle light or dark theme"), `settings.deloadLess`, `settings.deloadMore`,
  `settings.proteinLess`, `settings.proteinMore`.
- **Sentence fragments:** `history.daysAgo`, `history.weekAgo`, `history.weeksAgo`,
  `exercises.countShown`, `nutrition.vsTarget`.
- **Already correct:** `auth.signInWithGoogle` ("Continue with Google") — title case keeps
  short prepositions lowercase.
- **Dead:** `dashboard.logWeight` ("Log weight") has no reader in `src/` — the dashboard
  button uses `metrics.logWeight`. Leave it; deleting keys is out of scope. Report it.

Note one deliberate inconsistency this creates: the button `workout.previous` becomes
"Previous Workout" while the sheet it opens is headed `history.previousTitle`
("Previous workout"). That follows the rule — the first is a label, the second a heading — and
changing headings would drag in prose like "Let's set you up".

- [ ] **Step 3: Verify**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/strings/en.json','utf8')); console.log('ok')"`
Expected: `ok`

Run: `npx vitest run`
Expected: **all passing.** If a test fails, it is asserting on a changed string — read it: the
Task 9 tests query `'Start Fresh Run'` / `'Resume Previous Run'`, which Task 6 already wrote in
title case, so they should be unaffected. Fix any test that legitimately needs the new casing;
do **not** revert a string to make a test pass without saying so.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/strings/en.json
git commit -m "style(i18n): title-case action labels, leave prose alone"
```

---

## Task 11: Full verification

- [ ] **Step 1: Run everything**

```bash
npx vitest run
npx tsc -b --force
npm run lint
npm run build
```

Expected: all tests pass (324 baseline + Task 5's ~17 + Task 9's 7, plus anything your
adversarial passes added); typecheck silent on a forced rebuild; lint exactly
`✖ 9 problems (3 errors, 6 warnings)`; build succeeds.

- [ ] **Step 2: Confirm the tree is clean and the diff is only what you meant**

```bash
git status --porcelain
git diff --stat main..HEAD
```

Expected: no uncommitted files; the changed-file list matches the File Structure table at the
top of this plan and nothing else.

- [ ] **Step 3: Write down what a human must check**

You cannot verify any of this — the migration is unapplied and the app needs a signed-in
account. Add a checklist at `docs/superpowers/2026-08-25-meso-history-verification.md`
covering at minimum:

1. The switcher lists every meso, including one you deleted, and selecting each shows its
   sessions.
2. Deleting a meso removes it from the Mesos page but keeps it in the History switcher, with
   its day labels intact — the thing soft delete exists for.
3. Exporting CSV while a **past** meso is selected produces that meso's data, with its name in
   the filename. This is the hole that nearly cost real data.
4. "Unassigned workouts" appears only if you have orphaned sessions, and its cards show "—"
   for the day label.
5. Activating a trained meso offers three choices; **Resume** leaves the deload counter and
   "Previous workout" as they were, while **Fresh Run** clears both.
6. After a fresh run, History shows "Current run" and "Earlier runs" for that meso.
7. Activating a meso you have never trained does **not** show the dialog.
8. The renamed labels read correctly on the dashboard, workout screen, Mesos page and notes
   sheet — and no button now reads oddly.

Commit it.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(history): polish from the verification pass"
```

---

## Notes for the implementer

- **The migration is unapplied and you must not apply it.** The user's Supabase GitHub
  integration runs migrations on merge. Do not run `supabase db push`, `supabase start`, or
  anything touching a database, and do not edit `.github/` or `supabase/config` — the user has
  explicitly asked that their Supabase setup be left alone. Everything from Task 3 onward is
  therefore verified by types, tests and reading only.
- **`getLastPerformance` stays exactly as it is.** It reads the most recent session containing
  an exercise anywhere, ignoring meso and day. That is deliberate and was decided against a
  concrete alternative: the user treats a revisited meso as a new block, so recent numbers from
  *any* meso predict today's capacity better than old numbers from this one. If you "fix" it,
  you are undoing a decision, not finding a bug.
- **Do not add an undelete.** Delete is one-way in the UI by choice.
- **`history.empty` becomes unused** by `HistoryPage` in Task 7 (replaced by
  `history.emptyScope`). Leave the key; removing it is out of scope.
- Three lint errors pre-exist on `main` in `RequireAuth.test.tsx`, `MesoListPage.tsx` and
  `ExerciseLogPanel.tsx`. You edit `MesoListPage.tsx` in Task 9 — leave line 26 alone.
