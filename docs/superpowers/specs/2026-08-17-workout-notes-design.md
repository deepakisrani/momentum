# Workout notes with exercise tags — design

**Date:** 2026-08-17
**Status:** Approved (design)

## Problem

Momentum has nowhere to record anything that is not a number. Observations that
matter for training — "left elbow twinged on set 3", "sleep was bad, everything felt
heavy", "try a wider grip next chest day" — have no home, so they are lost. The user
wants to write notes both inside a workout and outside one, read them back away from
the workout screen, and tag exercises so a note can be found by the movement it
concerns.

## Requirements

Confirmed during brainstorming:

1. **Write from inside a workout,** attached to a specific exercise in that session.
2. **Write from outside a workout** (standalone, no session).
3. **Tag many exercises per note,** independently of where the note was written.
4. **Read on a dedicated Notes page,** filterable by tagged exercise. The workout
   screen is write-only in this version.
5. Notes are editable and deletable.

## Approach

One `note` table with a **nullable** `session_id`, plus a `note_exercise` join table
for tags. This single model serves both requirements 1 and 2:

- Note written in-workout on incline press -> `session_id` = the live session, and
  incline press auto-tagged.
- Standalone note -> `session_id` is null, tags chosen by hand.

Anchoring provenance to `session_id` + a tag rather than to `session_exercise_id`
matters: `session_exercise` rows are deleted when an exercise is removed from a
session (`removeSessionExercise`), which would silently destroy the note's anchor.
`workout_session` is stable, and `on delete set null` means even deleting a workout
demotes the note to standalone instead of taking it down.

## Schema — `supabase/migrations/0010_notes.sql`

```sql
create table note (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profile(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  session_id uuid references workout_session(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table note_exercise (
  note_id uuid not null references note(id) on delete cascade,
  exercise_id uuid not null references exercise(id) on delete cascade,
  primary key (note_id, exercise_id)
);

alter table note enable row level security;
alter table note_exercise enable row level security;

create policy note_self on note
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy note_exercise_self on note_exercise
  for all using (exists (select 1 from note n where n.id = note_exercise.note_id and n.user_id = auth.uid()))
  with check (exists (select 1 from note n where n.id = note_exercise.note_id and n.user_id = auth.uid()));

create index idx_note_user_created on note(user_id, created_at desc);
create index idx_note_session_id on note(session_id);
create index idx_note_exercise_note_id on note_exercise(note_id);
create index idx_note_exercise_exercise_id on note_exercise(exercise_id);
```

Conventions followed from the existing migrations: `user_id` references
`profile(id) on delete cascade` (`0001`); direct-ownership and derived-from-parent RLS
policies (`0002`); explicit indexes on FK columns used by RLS `EXISTS` subqueries
(`0005`). The composite primary key on `note_exercise` makes a duplicate tag
impossible. There are no triggers anywhere in this schema, so `updated_at` is set by
the client in `updateNote`.

## Module boundaries

- **`src/data/rows.ts`** — add row types:
  - `NoteRow = { id: string; user_id: string; body: string; session_id: string | null; created_at: string; updated_at: string }`
  - `NoteExerciseRow = { note_id: string; exercise_id: string }`
- **`src/data/noteRepo.ts`**
  - `NoteWithTags = NoteRow & { exerciseIds: string[] }`
  - `listNotes(userId: string, opts?: { exerciseId?: string; sessionId?: string }): Promise<NoteWithTags[]>`
    — newest first, each note carrying **all** its tags.
  - `createNote(userId: string, input: { body: string; sessionId: string | null; exerciseIds: string[] }): Promise<string>`
    — inserts the note, then the tag rows; returns the new id.
  - `updateNote(noteId: string, input: { body: string; exerciseIds: string[] }): Promise<void>`
    — updates body and `updated_at`, then replaces the tag set (delete all for the
    note, insert the new set). Replace-not-diff keeps this a single predictable pair of
    writes.
  - `deleteNote(noteId: string): Promise<void>` — tags cascade.

  **Query trap to avoid:** filtering by exercise must *not* use
  `note_exercise!inner(exercise_id)` with an `.eq` on the embedded column. PostgREST
  would return only the matching tag row, so a note tagged with three exercises would
  render with one chip. `listNotes({ exerciseId })` therefore runs two steps: select
  `note_id` from `note_exercise` where `exercise_id` matches, then select those notes
  with their full embedded tag list. (This is the same subtlety already present in
  `getLastPerformance`.)

- **`src/features/notes/noteFormat.ts`** (pure)
  - `groupNotesByDay(notes: NoteWithTags[]): { day: string; notes: NoteWithTags[] }[]`
    — groups by local calendar day (via the existing `localIsoDate`), days newest
    first, notes newest first inside each day.
  - `noteMatchesExercise(note: NoteWithTags, exerciseId: string | null): boolean` —
    `null` means "All".
  - `tagFilterOptions(notes: NoteWithTags[], namesById: Record<string, string>): { exerciseId: string; name: string }[]`
    — the distinct tagged exercises across the loaded notes, name-sorted, for the
    filter chips.
- **`src/features/notes/NoteEditorSheet.tsx`**
  - Props: `{ userId: string; note?: NoteWithTags; sessionId?: string | null; initialExerciseIds?: string[]; onSaved: () => void | Promise<void>; onClose: () => void }`.
  - Bottom sheet matching `PreviousWorkoutPanel` / `ExercisePickerSheet`, including
    `useBodyScrollLock`.
  - A `<textarea>` (autofocused), tag chips each with a ✕, and "Add exercise" which
    opens the existing `ExercisePickerSheet` and appends the picked exercise as a chip.
  - Save is disabled while the trimmed body is empty, mirroring the DB check
    constraint. Serves both create and edit; in edit mode it also offers delete.
- **`src/features/notes/NotesPage.tsx`** at `/notes`
  - Loads notes via `listNotes(userId)`, then resolves tag names with the existing
    `getExercisesByIds` over the union of tagged ids (one call, no N+1).
  - A filter chip row ("All" + `tagFilterOptions`) sets the active filter; re-filters
    through `listNotes({ exerciseId })`.
  - Body grouped by day with `groupNotesByDay`, using the existing `shortDate` /
    `relativeDate` helpers for headers. Each card shows the body, its tag chips, its
    time, and edit/delete. Delete confirms through the existing `ConfirmModal` with its
    `danger` flag set.
  - "New note" opens `NoteEditorSheet` with no session and no initial tags.
  - Empty state: `notes.empty`.
- **`src/features/session/ExerciseLogPanel.tsx`**
  - Adds a small "＋ Note" button that opens `NoteEditorSheet` with
    `sessionId = props.sessionId` and `initialExerciseIds = [sessionExercise.exercise_id]`.
    Write-only — the panel does not fetch notes, so nothing about its existing load
    path changes.
- **`src/App.tsx`** — add the `/notes` route inside the `RequireOnboarding`/`AppLayout`
  group. **`DashboardPage.tsx`** — add a Notes card alongside the existing ones.

## Edge cases

- **Empty/whitespace body:** save disabled client-side; the DB check constraint is the
  backstop.
- **Note with no tags:** allowed; it appears under "All" but under no exercise chip.
- **Tagged exercise deleted** from the library: `note_exercise` cascades, so the note
  survives and simply loses that chip.
- **Workout deleted:** `session_id` becomes null; the note survives as standalone.
- **Exercise removed from a session** after a note was written: the note is unaffected
  (this is the reason for not anchoring to `session_exercise_id`).
- **Filtering by an exercise with no notes:** empty state within the active filter.
- **Note written in-workout, then its tag removed by the user:** allowed — the note
  keeps `session_id` and simply has no tags.

## Error handling

Mirrors the existing app: `busy` flags on save/delete buttons, inline `common.error`
text on failure, and `if (import.meta.env.DEV) console.error('[Notes] …', err)`. No
optimistic updates — save, then reload the list, as `ExerciseLogPanel` and `GoalsPage`
already do.

## Testing (Vitest)

Following this repo's precedent (`exportRepo.test.ts` tests the pure flatten helper and
leaves Supabase unmocked), `noteRepo` itself is not unit-tested; all testable logic is
pure:

- `noteFormat.test.ts`
  - `groupNotesByDay`: days newest first; notes newest first inside a day; notes on the
    same local day grouped together across differing timestamps; empty input -> `[]`.
  - `noteMatchesExercise`: matches a tagged id; rejects an untagged id; `null` matches
    everything, including a note with no tags.
  - `tagFilterOptions`: distinct ids across notes; name-sorted; ignores notes with no
    tags; falls back gracefully when a name is missing from the map.

## i18n

New flat keys in `src/i18n/strings/en.json`: `nav.notes`, `notes.title`, `notes.new`,
`notes.empty`, `notes.placeholder`, `notes.addExercise`, `notes.filterAll`,
`notes.edit`, `notes.delete`, `notes.deleteConfirm`, `notes.addFromWorkout`
("＋ Note"), `notes.noTags`. Note bodies and exercise names are data, not UI copy, so
they are not translated.

## Out of scope

- Reading notes on the workout, history, or progress screens (the read model is the
  Notes page only in this version; adding it later is a `listNotes({ exerciseId })`
  call in the relevant panel).
- Notes in the CSV export.
- Free-text / hashtag tags beyond exercise tags.
- Full-text search, pinning, reminders, or attachments.
- Per-set notes.
