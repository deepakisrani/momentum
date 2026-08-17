# Workout Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user write notes inside a workout (anchored to a session, with the exercise auto-tagged) and outside one (standalone), tag any number of exercises per note, and read them back on a filterable Notes page.

**Architecture:** One `note` table with a **nullable** `session_id` plus a `note_exercise` join table, so a single model covers both in-workout and standalone notes. Anchoring provenance to `session_id` rather than `session_exercise_id` matters because `session_exercise` rows are hard-deleted when an exercise is removed from a session. Query and UI code follow the existing repo/feature split; list logic is pure and unit-tested.

**Tech Stack:** React 18 + TypeScript, Tailwind, react-router-dom, Supabase (Postgres + RLS), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-workout-notes-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0010_notes.sql` | **Create.** `note` + `note_exercise` tables, RLS policies, FK indexes. |
| `src/data/rows.ts` | **Modify.** Add `NoteRow`, `NoteExerciseRow`. |
| `src/data/noteRepo.ts` | **Create.** All note queries. The only file that talks to Supabase about notes. |
| `src/features/notes/noteFormat.ts` | **Create.** Pure list logic: day grouping, filter predicate, filter options. |
| `src/features/notes/noteFormat.test.ts` | **Create.** Unit tests for the above. |
| `src/features/notes/NoteEditorSheet.tsx` | **Create.** Bottom-sheet create/edit form, shared by both entry points. |
| `src/features/notes/NotesPage.tsx` | **Create.** The read surface: grouped list + exercise filter. |
| `src/features/session/ExerciseLogPanel.tsx` | **Modify.** "＋ Note" button opening the sheet, session + exercise prefilled. |
| `src/App.tsx` | **Modify.** `/notes` route. |
| `src/features/profile/DashboardPage.tsx` | **Modify.** Notes card. |
| `src/i18n/strings/en.json` | **Modify.** `notes.*` and `nav.notes` keys. |

Order: schema → data types → repo → pure logic → editor → page → workout entry point. Each task after Task 3 leaves the app working and shippable.

---

## Task 1: Schema and RLS

**Files:**
- Create: `supabase/migrations/0010_notes.sql`

There is no local Postgres in this repo and no migration test harness, so verification here is a careful read plus (if you have the Supabase CLI linked) a real apply. Do not skip Step 2.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_notes.sql`:

```sql
-- Notes. `session_id` is nullable so one table serves both a note written during a
-- workout (session set, exercise tagged) and a standalone note written any time.
-- Provenance is deliberately NOT session_exercise_id: those rows are hard-deleted when
-- an exercise is removed from a session, which would destroy the anchor.
create table note (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profile(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  session_id uuid references workout_session(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exercise tags. Composite PK makes a duplicate tag impossible.
create table note_exercise (
  note_id uuid not null references note(id) on delete cascade,
  exercise_id uuid not null references exercise(id) on delete cascade,
  primary key (note_id, exercise_id)
);

alter table note enable row level security;
alter table note_exercise enable row level security;

-- Direct user-owned table.
create policy note_self on note
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Child table: access derived from the owning note.
create policy note_exercise_self on note_exercise
  for all using (exists (select 1 from note n where n.id = note_exercise.note_id and n.user_id = auth.uid()))
  with check (exists (select 1 from note n where n.id = note_exercise.note_id and n.user_id = auth.uid()));

-- Indexes on the FK columns used by the RLS EXISTS subqueries and the list queries
-- (Postgres does not auto-create these).
create index idx_note_user_created on note(user_id, created_at desc);
create index idx_note_session_id on note(session_id);
create index idx_note_exercise_note_id on note_exercise(note_id);
create index idx_note_exercise_exercise_id on note_exercise(exercise_id);
```

- [ ] **Step 2: Verify it against the existing conventions**

Read `supabase/migrations/0001_initial_schema.sql`, `0002_rls_policies.sql`, and `0005_fk_indexes.sql` and confirm, line by line:

- `user_id` references `profile(id) on delete cascade` — same as `weight_log`/`goal_log`.
- The direct-ownership policy shape matches `weight_self`.
- The derived policy shape matches `meso_day_self` (an `exists (...)` in both `using` and `with check`).
- Every FK column referenced by a policy has an index, per `0005`'s stated rationale.

- [ ] **Step 3: Apply it**

If the Supabase CLI is linked to the project:

```bash
npx supabase db push
```

Expected: `0010_notes.sql` applies cleanly.

If it is not linked, run the file's contents in the Supabase SQL editor for the project, then confirm both tables appear with RLS enabled. **The app cannot work until this is applied** — the repo code in Task 3 will fail with a missing-relation error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_notes.sql
git commit -m "feat(db): note + note_exercise tables with RLS and FK indexes"
```

---

## Task 2: Row types

**Files:**
- Modify: `src/data/rows.ts`

- [ ] **Step 1: Add the row types**

Append to `src/data/rows.ts`, matching the existing style in that file:

```ts
export interface NoteRow {
  id: string
  user_id: string
  body: string
  session_id: string | null
  created_at: string
  updated_at: string
}

export interface NoteExerciseRow {
  note_id: string
  exercise_id: string
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc -b`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/data/rows.ts
git commit -m "feat(data): note row types"
```

---

## Task 3: Note repository

**Files:**
- Create: `src/data/noteRepo.ts`

Following this repo's precedent (`exportRepo.test.ts` tests only the pure helper and leaves Supabase unmocked), there are no unit tests for the queries themselves; the pure logic they feed is tested in Task 4, and this task ends with a real manual read/write check.

- [ ] **Step 1: Write the repository**

Create `src/data/noteRepo.ts`:

```ts
import { supabase } from '../lib/supabase'
import type { NoteRow } from './rows'

export interface NoteWithTags extends NoteRow { exerciseIds: string[] }

const NOTE_SELECT = 'id, user_id, body, session_id, created_at, updated_at, note_exercise(exercise_id)'

type RawNote = NoteRow & { note_exercise: { exercise_id: string }[] }

function toNote(r: RawNote): NoteWithTags {
  return {
    id: r.id,
    user_id: r.user_id,
    body: r.body,
    session_id: r.session_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    exerciseIds: (r.note_exercise ?? []).map((t) => t.exercise_id),
  }
}

/** Notes for a user, newest first, each carrying ALL of its tags.
 *
 * The exercise filter runs in two steps on purpose. Filtering with an embedded
 * `note_exercise!inner(exercise_id)` + `.eq(...)` would return only the MATCHING tag,
 * so a note tagged with three exercises would render with a single chip. */
export async function listNotes(
  userId: string,
  opts?: { exerciseId?: string; sessionId?: string },
): Promise<NoteWithTags[]> {
  let ids: string[] | null = null
  if (opts?.exerciseId) {
    const { data, error } = await supabase
      .from('note_exercise').select('note_id').eq('exercise_id', opts.exerciseId)
    if (error) throw error
    ids = (data ?? []).map((r) => r.note_id as string)
    if (!ids.length) return []
  }
  let q = supabase
    .from('note').select(NOTE_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (ids) q = q.in('id', ids)
  if (opts?.sessionId) q = q.eq('session_id', opts.sessionId)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as unknown as RawNote[]).map(toNote)
}

export async function createNote(
  userId: string,
  input: { body: string; sessionId: string | null; exerciseIds: string[] },
): Promise<string> {
  const { data, error } = await supabase
    .from('note')
    .insert({ user_id: userId, body: input.body.trim(), session_id: input.sessionId })
    .select('id').single()
  if (error) throw error
  const noteId = data.id as string
  await replaceTags(noteId, input.exerciseIds)
  return noteId
}

export async function updateNote(
  noteId: string,
  input: { body: string; exerciseIds: string[] },
): Promise<void> {
  const { error } = await supabase
    .from('note')
    .update({ body: input.body.trim(), updated_at: new Date().toISOString() })
    .eq('id', noteId)
  if (error) throw error
  await replaceTags(noteId, input.exerciseIds)
}

/** Tags cascade via the FK. */
export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase.from('note').delete().eq('id', noteId)
  if (error) throw error
}

/** Replace a note's tag set: clear, then insert. Two predictable writes, no diffing. */
async function replaceTags(noteId: string, exerciseIds: string[]): Promise<void> {
  const { error: delError } = await supabase.from('note_exercise').delete().eq('note_id', noteId)
  if (delError) throw delError
  const unique = [...new Set(exerciseIds)]
  if (!unique.length) return
  const { error } = await supabase
    .from('note_exercise')
    .insert(unique.map((exercise_id) => ({ note_id: noteId, exercise_id })))
  if (error) throw error
}
```

`updated_at` is set here because this schema has no triggers anywhere — check `0001` if you doubt it.

- [ ] **Step 2: Verify**

Run: `npx tsc -b`
Expected: no output.

Run: `npm test`
Expected: PASS (nothing new yet; this confirms no import broke).

- [ ] **Step 3: Commit**

```bash
git add src/data/noteRepo.ts
git commit -m "feat(data): note repository with two-step exercise filter"
```

---

## Task 4: Pure list logic

**Files:**
- Create: `src/features/notes/noteFormat.ts`
- Test: `src/features/notes/noteFormat.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/notes/noteFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupNotesByDay, noteMatchesExercise, tagFilterOptions } from './noteFormat'
import type { NoteWithTags } from '../../data/noteRepo'

function note(id: string, createdAt: string, exerciseIds: string[] = []): NoteWithTags {
  return {
    id, user_id: 'u1', body: `body ${id}`, session_id: null,
    created_at: createdAt, updated_at: createdAt, exerciseIds,
  }
}

describe('groupNotesByDay', () => {
  it('returns [] for no notes', () => { expect(groupNotesByDay([])).toEqual([]) })

  it('groups by local day, days newest first and notes newest first inside a day', () => {
    const out = groupNotesByDay([
      note('a', '2026-08-17T09:00:00Z'),
      note('b', '2026-08-15T18:00:00Z'),
      note('c', '2026-08-17T20:00:00Z'),
    ])
    expect(out.length).toBe(2)
    expect(out[0].notes.map((n) => n.id)).toEqual(['c', 'a'])
    expect(out[1].notes.map((n) => n.id)).toEqual(['b'])
    expect(out[0].day > out[1].day).toBe(true)
  })

  it('keeps notes from the same local day together regardless of input order', () => {
    const out = groupNotesByDay([
      note('a', '2026-08-17T01:00:00Z'),
      note('b', '2026-08-16T23:00:00Z'),
      note('c', '2026-08-17T23:00:00Z'),
    ])
    const days = out.map((d) => d.day)
    expect(new Set(days).size).toBe(days.length) // no duplicate day buckets
    expect(out.reduce((n, d) => n + d.notes.length, 0)).toBe(3)
  })
})

describe('noteMatchesExercise', () => {
  it('matches a tagged exercise', () => {
    expect(noteMatchesExercise(note('a', '2026-08-17T09:00:00Z', ['e1', 'e2']), 'e2')).toBe(true)
  })
  it('rejects an untagged exercise', () => {
    expect(noteMatchesExercise(note('a', '2026-08-17T09:00:00Z', ['e1']), 'e9')).toBe(false)
  })
  it('matches everything when the filter is null, including untagged notes', () => {
    expect(noteMatchesExercise(note('a', '2026-08-17T09:00:00Z', []), null)).toBe(true)
  })
})

describe('tagFilterOptions', () => {
  const names = { e1: 'Squat', e2: 'Bench Press', e3: 'Row' }

  it('returns the distinct tagged exercises, name-sorted', () => {
    const out = tagFilterOptions([
      note('a', '2026-08-17T09:00:00Z', ['e1', 'e2']),
      note('b', '2026-08-16T09:00:00Z', ['e2', 'e3']),
    ], names)
    expect(out.map((o) => o.name)).toEqual(['Bench Press', 'Row', 'Squat'])
    expect(out.map((o) => o.exerciseId)).toEqual(['e2', 'e3', 'e1'])
  })

  it('ignores notes with no tags', () => {
    expect(tagFilterOptions([note('a', '2026-08-17T09:00:00Z', [])], names)).toEqual([])
  })

  it('falls back to a dash when a name is missing', () => {
    const out = tagFilterOptions([note('a', '2026-08-17T09:00:00Z', ['gone'])], names)
    expect(out).toEqual([{ exerciseId: 'gone', name: '—' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/notes/noteFormat.test.ts`
Expected: FAIL — `Failed to resolve import "./noteFormat"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/notes/noteFormat.ts`:

```ts
import { localIsoDate } from '../history/historyFormat'
import type { NoteWithTags } from '../../data/noteRepo'

export interface NoteDay { day: string; notes: NoteWithTags[] }

/** Notes bucketed by local calendar day, days newest first, notes newest first inside
 * each day. Uses localIsoDate so the buckets match the dates the app displays. */
export function groupNotesByDay(notes: NoteWithTags[]): NoteDay[] {
  const byDay = new Map<string, NoteWithTags[]>()
  for (const n of notes) {
    const day = localIsoDate(n.created_at)
    const cur = byDay.get(day)
    if (cur) cur.push(n)
    else byDay.set(day, [n])
  }
  return [...byDay.entries()]
    .map(([day, ns]) => ({ day, notes: [...ns].sort((a, b) => b.created_at.localeCompare(a.created_at)) }))
    .sort((a, b) => b.day.localeCompare(a.day))
}

/** `null` means "All" — it matches every note, tagged or not. */
export function noteMatchesExercise(note: NoteWithTags, exerciseId: string | null): boolean {
  if (exerciseId == null) return true
  return note.exerciseIds.includes(exerciseId)
}

/** The distinct exercises tagged across `notes`, name-sorted, for the filter chips. */
export function tagFilterOptions(
  notes: NoteWithTags[],
  namesById: Record<string, string>,
): { exerciseId: string; name: string }[] {
  const ids = new Set<string>()
  for (const n of notes) for (const id of n.exerciseIds) ids.add(id)
  return [...ids]
    .map((exerciseId) => ({ exerciseId, name: namesById[exerciseId] ?? '—' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/notes/noteFormat.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/notes/noteFormat.ts src/features/notes/noteFormat.test.ts
git commit -m "feat(notes): pure day-grouping and tag-filter helpers"
```

---

## Task 5: i18n strings

**Files:**
- Modify: `src/i18n/strings/en.json`

- [ ] **Step 1: Add the keys**

Add to `src/i18n/strings/en.json` (flat object, position does not matter):

```json
  "nav.notes": "Notes",
  "notes.title": "Notes",
  "notes.new": "New note",
  "notes.empty": "No notes yet. Jot something down after a set — or any time.",
  "notes.emptyFiltered": "No notes for this exercise yet.",
  "notes.placeholder": "What happened? What should future you know?",
  "notes.addExercise": "Tag exercise",
  "notes.filterAll": "All",
  "notes.edit": "Edit",
  "notes.delete": "Delete",
  "notes.deleteConfirm": "Delete this note? This can't be undone.",
  "notes.addFromWorkout": "＋ Note",
  "notes.noTags": "No exercises tagged",
  "notes.removeTag": "Remove tag",
```

- [ ] **Step 2: Verify the file still parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/strings/en.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/i18n/strings/en.json
git commit -m "feat(i18n): notes strings"
```

---

## Task 6: Note editor sheet

**Files:**
- Create: `src/features/notes/NoteEditorSheet.tsx`

Serves both create and edit, and both entry points. It reuses the existing `ExercisePickerSheet` (`{ onPick, onClose }`) to add one tag at a time.

- [ ] **Step 1: Write the component**

Create `src/features/notes/NoteEditorSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { createNote, updateNote, type NoteWithTags } from '../../data/noteRepo'
import { getExercisesByIds } from '../../data/exerciseRepo'
import { ExercisePickerSheet } from '../mesos/ExercisePickerSheet'

/** Create/edit a note. `note` present = edit; otherwise create with `sessionId` and
 * `initialExerciseIds` (the in-workout path prefills both). */
export function NoteEditorSheet({
  userId, note, sessionId = null, initialExerciseIds = [], onSaved, onClose,
}: {
  userId: string
  note?: NoteWithTags
  sessionId?: string | null
  initialExerciseIds?: string[]
  onSaved: () => void | Promise<void>
  onClose: () => void
}) {
  const t = useT()
  useBodyScrollLock()
  const [body, setBody] = useState(note?.body ?? '')
  const [tags, setTags] = useState<string[]>(note?.exerciseIds ?? initialExerciseIds)
  const [names, setNames] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolve tag names for the chips (one call for the whole set).
  useEffect(() => {
    if (!tags.length) return
    getExercisesByIds(tags)
      .then((byId) => setNames((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(byId).map(([id, ex]) => [id, ex.name])) })))
      .catch(() => {})
  }, [tags])

  async function save() {
    if (!body.trim()) return
    setBusy(true); setError(null)
    try {
      if (note) await updateNote(note.id, { body, exerciseIds: tags })
      else await createNote(userId, { body, sessionId, exerciseIds: tags })
      await onSaved()
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Notes] save failed:', err)
      setError(t('common.error'))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div className="mt-auto max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white sm:mx-auto sm:max-w-2xl sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{note ? t('notes.edit') : t('notes.new')}</h2>
          <button onClick={onClose} className="text-sm text-slate-500 dark:text-slate-400">{t('exercises.cancel')}</button>
        </div>

        <textarea
          autoFocus
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('notes.placeholder')}
          aria-label={t('notes.title')}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {tags.map((id) => (
            <span key={id} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold dark:bg-[#1b2030]">
              {names[id] ?? '…'}
              <button onClick={() => setTags((ts) => ts.filter((x) => x !== id))} aria-label={t('notes.removeTag')} className="text-slate-400">✕</button>
            </span>
          ))}
          <button onClick={() => setPickerOpen(true)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-[#1b2030] dark:text-brand-400">
            + {t('notes.addExercise')}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button
          onClick={save}
          disabled={busy || !body.trim()}
          className="mt-4 w-full rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>

      {pickerOpen && (
        <ExercisePickerSheet
          onPick={(ex) => {
            setPickerOpen(false)
            setNames((m) => ({ ...m, [ex.id]: ex.name }))
            setTags((ts) => (ts.includes(ex.id) ? ts : [...ts, ex.id]))
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
```

Save is disabled on an empty/whitespace body, mirroring the `check (length(trim(body)) > 0)` constraint — the DB check is the backstop, not the UX.

- [ ] **Step 2: Verify**

Run: `npx tsc -b`
Expected: no output.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/notes/NoteEditorSheet.tsx
git commit -m "feat(notes): create/edit sheet with exercise tag chips"
```

---

## Task 7: Notes page

**Files:**
- Create: `src/features/notes/NotesPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/profile/DashboardPage.tsx`

- [ ] **Step 1: Write the page**

Create `src/features/notes/NotesPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { listNotes, deleteNote, type NoteWithTags } from '../../data/noteRepo'
import { getExercisesByIds } from '../../data/exerciseRepo'
import { groupNotesByDay, tagFilterOptions } from './noteFormat'
import { NoteEditorSheet } from './NoteEditorSheet'
import { ConfirmModal } from '../../components/ConfirmModal'
import { shortDate } from '../history/historyFormat'

export function NotesPage() {
  const t = useT()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [notes, setNotes] = useState<NoteWithTags[] | null>(null)
  const [allNotes, setAllNotes] = useState<NoteWithTags[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<string | null>(null)
  const [editing, setEditing] = useState<NoteWithTags | null>(null)
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<NoteWithTags | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setError(false)
    // The unfiltered set drives the chip row, so the chips do not vanish once a filter
    // narrows the list. With no filter the two lists are the same fetch — do not repeat it.
    const all = await listNotes(userId)
    const shown = filter ? await listNotes(userId, { exerciseId: filter }) : all
    setAllNotes(all)
    setNotes(shown)
    const ids = [...new Set(all.flatMap((n) => n.exerciseIds))]
    if (ids.length) {
      const byId = await getExercisesByIds(ids)
      setNames(Object.fromEntries(Object.entries(byId).map(([id, ex]) => [id, ex.name])))
    }
  }, [userId, filter])

  useEffect(() => { load().catch(() => { setError(true); setNotes([]) }) }, [load])

  async function confirmDelete(note: NoteWithTags) {
    try {
      await deleteNote(note.id)
      await load()
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Notes] delete failed:', err)
      setError(true)
    } finally { setPendingDelete(null) }
  }

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-[#1b2030]'}`
  const options = tagFilterOptions(allNotes, names)
  const days = groupNotesByDay(notes ?? [])

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{t('notes.title')}</h1>
          <button onClick={() => setCreating(true)} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
            {t('notes.new')}
          </button>
        </div>

        {options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button aria-pressed={filter === null} className={chip(filter === null)} onClick={() => setFilter(null)}>{t('notes.filterAll')}</button>
            {options.map((o) => (
              <button key={o.exerciseId} aria-pressed={filter === o.exerciseId} className={chip(filter === o.exerciseId)} onClick={() => setFilter(o.exerciseId)}>
                {o.name}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-500">{t('common.error')}</p>}

        {notes === null ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{filter ? t('notes.emptyFiltered') : t('notes.empty')}</p>
        ) : (
          days.map((d) => (
            <div key={d.day} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase text-slate-400">{shortDate(d.notes[0].created_at)}</h2>
              {d.notes.map((n) => (
                <div key={n.id} className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
                  <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {n.exerciseIds.map((id) => (
                      <span key={id} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold dark:bg-[#0f1115]">{names[id] ?? '…'}</span>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-3 text-xs font-semibold">
                    <button onClick={() => setEditing(n)} className="text-brand-700 dark:text-brand-400">{t('notes.edit')}</button>
                    <button onClick={() => setPendingDelete(n)} className="text-red-500">{t('notes.delete')}</button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {creating && (
        <NoteEditorSheet
          userId={userId}
          onSaved={async () => { await load(); setCreating(false) }}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <NoteEditorSheet
          userId={userId}
          note={editing}
          onSaved={async () => { await load(); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
      {pendingDelete && (
        <ConfirmModal
          body={t('notes.deleteConfirm')}
          confirmLabel={t('notes.delete')}
          cancelLabel={t('exercises.cancel')}
          danger
          onConfirm={() => confirmDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add the import:

```tsx
import { NotesPage } from './features/notes/NotesPage'
```

and the route inside the `RequireOnboarding`/`AppLayout` group, after the `/nutrition` line:

```tsx
                  <Route path="/notes" element={<NotesPage />} />
```

- [ ] **Step 3: Add the dashboard card**

In `src/features/profile/DashboardPage.tsx`, inside the `grid` of `<Link>` cards, after the `/nutrition` card:

```tsx
            <Link to="/notes" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('notes.title')}</Link>
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b`
Expected: no output.

Run: `npm test`
Expected: PASS.

Run `npm run dev`, go to the dashboard → Notes.
Expected: empty state; "New note" opens the sheet; typing a body enables Save; saving shows the note; "Tag exercise" adds a chip; the chip row appears once a note has a tag; filtering by that exercise narrows the list while the chip row stays put; edit and delete both work.

- [ ] **Step 5: Commit**

```bash
git add src/features/notes/NotesPage.tsx src/App.tsx src/features/profile/DashboardPage.tsx
git commit -m "feat(notes): notes page with day grouping and exercise filter"
```

---

## Task 8: Write a note from inside a workout

**Files:**
- Modify: `src/features/session/ExerciseLogPanel.tsx`

- [ ] **Step 1: Add the button and the sheet**

In `src/features/session/ExerciseLogPanel.tsx`, add imports:

```tsx
import { NoteEditorSheet } from '../notes/NoteEditorSheet'
```

Add state beside the existing `busy`/`saveState` state:

```tsx
  const [noteOpen, setNoteOpen] = useState(false)
```

Add the button directly after the "Add set" button, still inside the panel's root `<div>`:

```tsx
      <button onClick={() => setNoteOpen(true)} className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-brand-700 dark:bg-[#1b2030] dark:text-brand-400">
        {t('notes.addFromWorkout')}
      </button>

      {noteOpen && (
        <NoteEditorSheet
          userId={userId}
          sessionId={sessionId}
          initialExerciseIds={[sessionExercise.exercise_id]}
          onSaved={() => setNoteOpen(false)}
          onClose={() => setNoteOpen(false)}
        />
      )}
```

`userId` and `sessionId` are already props of this component, and `sessionExercise.exercise_id` is the exercise being logged — so the note lands with the live session as provenance and this exercise pre-tagged. The panel does **not** fetch notes: this version is write-only from the workout, so its existing load path is untouched.

- [ ] **Step 2: Verify**

Run: `npx tsc -b`
Expected: no output.

Run: `npm test`
Expected: PASS.

Run `npm run dev`, start a workout, expand an exercise, tap "＋ Note", write something, save. Then open the Notes page.
Expected: the note is listed with that exercise already tagged, and filtering by that exercise finds it.

- [ ] **Step 3: Commit**

```bash
git add src/features/session/ExerciseLogPanel.tsx
git commit -m "feat(notes): write a note from inside a workout, exercise pre-tagged"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS. `noteFormat.test.ts` adds 9 tests.

- [ ] **Step 2: Lint, typecheck, build**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: completes and writes `dist/`.

- [ ] **Step 3: Walk the edge cases by hand**

With `npm run dev`:

1. Save a note with **no tags** → appears under "All", under no chip.
2. Create a note in a workout, then **remove that exercise from the session** → the note survives with its tag intact (this is why provenance is `session_id`, not `session_exercise_id`).
3. Filter by an exercise that has notes, then delete its only note → the filtered empty state shows, and the chip disappears after the reload.
4. A body of only spaces → Save stays disabled.
5. A long multi-paragraph body → renders with line breaks preserved (`whitespace-pre-wrap`).

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(notes): polish from the manual pass"
```

---

## Notes for the implementer

- **Never** filter notes with `note_exercise!inner(exercise_id)` + `.eq(...)`. PostgREST returns only the matching tag, so a multi-tag note renders with one chip. `listNotes` filters in two steps for this reason.
- `session_id` is provenance only in this version — nothing reads it yet. It exists so "which workout was this written during" is recoverable later without a migration.
- The workout panel is **write-only** for notes by design. Surfacing them there later is a `listNotes(userId, { exerciseId })` call in `ExerciseLogPanel`; the repo already supports it.
- Out of scope: notes in the CSV export, notes on history/progress screens, search, per-set notes, free-text tags.
