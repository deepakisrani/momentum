# Past-meso history and meso lifecycle — design

**Date:** 2026-08-25
**Status:** Approved (design)

## Problem

Switching to a new mesocycle makes the previous one's training log unreachable. The user
hit this for real: after creating and activating a new meso, months of logged workouts
vanished from the app, and they were only saved by having downloaded a CSV earlier.

None of the data is actually lost — every session still carries its own `meso_id` and
`meso_day_id`, and Progress charts already read across all mesos via their "All" range.
Two surfaces are hard-scoped to the *active* meso:

- `HistoryPage` calls `getActiveMeso` and lists only that meso's sessions.
- The CSV export does the same, so **switching meso also removes the ability to export
  what came before** — the reason the earlier download turned out to be load-bearing.

Investigation surfaced two further problems the fix has to account for.

**Deleting a meso silently orphans its history.** `workout_session.meso_id` is
`on delete set null`, so sessions survive a delete but become invisible (History requires
a meso). Worse, `meso_day.meso_id` is `on delete cascade`, so a hard delete destroys the
day plan — meaning even a recovered session would show no day label ("Push A" is gone with
the row that held it). The confirmation for this reads, in full: "Delete this meso?"

**Re-activating an old meso resurrects stale training context.** The user's mental model is
that returning to a meso after months away is a *new* block that should carry no history.
The code assumes the opposite: `getMesoDayStats` and the "Previous workout" panel are
meso-and-day scoped, so re-activation reconnects months-old sessions. The consequential one
is the deload counter — `sessionsSinceLastDeload` counts back through that day's sessions
until it finds a deload, so a meso abandoned four sessions past its last deload can
immediately report "Deload scheduled" on the strength of months-old data.

## Requirements

Confirmed during brainstorming:

1. **Browse** past mesos' sessions in-app, and **export** any meso to CSV — not just the
   active one.
2. Reaching a past meso lives on the **History page**, via a meso switcher.
3. **Delete becomes soft**, so history is never orphaned by a delete again. Soft-deleted
   mesos disappear from the Mesos page but remain available in History as a grouping.
4. **No restore.** Delete is one-way from the UI's point of view.
5. Legacy orphans (sessions whose meso was hard-deleted before this change, or which were
   logged with no active meso) are reachable as an **"Unassigned"** entry.
6. **Re-activating a trained meso starts a fresh run automatically** — no habit for the user
   to remember — implemented as an activation window rather than a duplicate or a runs table.
7. Action labels are **title case**.

## Part A — soft delete

### Schema — `supabase/migrations/0011_meso_soft_delete_and_activation.sql`

```sql
alter table meso add column deleted_at timestamptz;
alter table meso add column activated_at timestamptz;
```

Both columns start `NULL` on existing rows. `NULL deleted_at` means "not deleted";
`NULL activated_at` means "no window", i.e. exactly today's behaviour — so nothing already
logged is retroactively hidden or reset.

Deliberately **no new index**. `meso` holds a handful of rows per user, and the `meso_self`
policy is a direct `user_id = auth.uid()` rather than an `EXISTS` subquery, so `0005`'s
stated rationale for FK indexes does not apply. Adding one would be cargo-cult.

### Repo changes (`src/data/mesoRepo.ts`)

- **`deleteMeso`** becomes `update meso set deleted_at = now(), is_active = false`. Clearing
  `is_active` matters twice: a deleted meso must not keep driving the workout screen, and it
  keeps the `one_active_meso_per_user` partial unique index honest.
- **`listMesos`** gains `.is('deleted_at', null)` — this is what removes deleted mesos from
  the Mesos page.
- **`listMesosForHistory`** (new) returns *all* mesos including deleted, newest first. A
  separate function rather than a flag, so no caller can accidentally surface deleted mesos
  where they are not wanted.
- **`getActiveMeso`** gains `.is('deleted_at', null)`, defensively.
- **`getMesoFull`** unchanged: History needs it to read day labels for a deleted meso, and
  preserving those rows is the point of soft-deleting.

Nothing needs to guard the meso builder against a soft-deleted id: it is unreachable from
the Mesos list, so only a stale URL could reach it, and editing a dead plan harms nothing.

## Part A2 — soft-delete meso days too

**Found during implementation, after the design was approved.** Soft-deleting the *meso* closes
one door onto orphaned history; editing a meso closes on another. `updateMeso` hard-deletes the
`meso_day` rows the user removed, and `workout_session.meso_day_id` is `on delete set null`, so
removing a day permanently strips the day label off every session ever logged on it — those
sessions then show "—", vanish from the day-filtered "Previous workout" panel, and stop counting
toward the deload cadence. No deletion of the meso is involved; restructuring a trained meso is
enough. The comment above that code claims the reconcile "preserves history:
workout_session.meso_day_id", which is true for kept days and false for removed ones.

Same remedy, one column: `meso_day.deleted_at` (migration `0012`). Removed days are stamped
rather than deleted. `getMesoFull` — which feeds the builder, the workout-day chooser and
Duplicate, all of which plan *future* training — filters them out. History reads a new
`getMesoDayLabels(mesoId)` that deliberately includes them, because naming a past session is
exactly the case where a removed day still matters.

`meso_day_exercise` stays a hard delete: history reaches an exercise through
`session_exercise.exercise_id`, never through the plan row, so removing a planned exercise
destroys no logged data.

## Part B — History switcher and Unassigned

`listMesoSessions(userId, mesoId, …)` and `getMesoSetRows(userId, mesoId)` widen `mesoId` to
`string | null`, using `.is('meso_id', null)` when null. That is the Unassigned bucket, and
it is backward compatible — `PreviousWorkoutPanel` keeps passing a real id.

`HistoryPage` gains a meso switcher above the list, driving **both** the session list and the
CSV export, so the export filename comes from the selected meso rather than the active one.
That closes the hole that nearly cost the user their log.

- Options come from `listMesosForHistory`, newest first, plus **"Unassigned"** shown only
  when orphaned sessions exist — a new `countUnassignedSessions(userId)` in `sessionRepo`,
  one head/count request on load.
- Default selection: the active meso; else the newest meso; else Unassigned.
- Deleted mesos are listed plainly, with no badge — the row exists to group history.
- Day labels come from `getMesoFull(selectedMesoId)`.

**Honest limitation:** Unassigned sessions render day labels as "—". Their `meso_day_id` was
nulled when the old hard delete cascaded `meso_day` away. Those rows are gone; nothing can
recover them. Soft delete prevents this going forward but cannot undo it.

## Part C — activation window

`activated_at` records when the current run of a meso began. Day-scoped surfaces filter to
sessions on or after it; everything else does not.

| Surface | Windowed? | Why |
|---|---|---|
| Deload cadence + "Last workout" date (`getMesoDayStats`) | **Yes** | This *is* the fresh start |
| "Previous workout" panel (`listMesoSessions` with `mesoDayId`) | **Yes** | Shows only the current run |
| History list | No | Split into "Current run" / "Earlier" (below) |
| CSV export | No | Exports the whole meso, all runs |
| LAST TIME line / suggestions (`getLastPerformance`) | No | Unchanged — see below |

`listMesoSessions` therefore takes an optional `since?: string | null` (an ISO timestamp),
applied as `.gte('started_at', since)` when present. `PreviousWorkoutPanel` passes the
selected meso's `activated_at`; History passes nothing.

The Unassigned bucket has no meso and therefore no `activated_at`, so it is never split — its
sessions render as one list.

**`getLastPerformance` stays exercise-scoped and unwindowed, deliberately.** It reads the
most recent session containing that exercise anywhere. That looks wrong in isolation — it is
what made a chest-press "LAST TIME" line disagree with the "Previous workout" panel during
investigation — but it is correct under this user's model: returning to meso 1 after two
months of meso 2, what you can lift today is better predicted by last week's meso 2 numbers
than by two-month-old meso 1 numbers.

### The activation dialog

Activating a meso that **already has completed sessions** and **is not already active**
offers three outcomes:

- **Start fresh run** — activate and stamp `activated_at = now()`.
- **Resume previous run** — activate without stamping, keeping the existing window and
  deload cadence.
- **Cancel** — do nothing.

Three buttons, not two, and this is load-bearing. A two-button "Start fresh run? / Cancel"
breaks the exact case it exists to protect: with meso 1 four sessions into a block, an
accidental switch to meso 2 and back leaves the user choosing between resetting their cadence
(confirm) and leaving the wrong meso active (cancel). So this needs a small purpose-built
modal rather than the two-button `ConfirmModal`.

Activation is silent when the meso has no completed sessions — there is nothing to preserve.

### History grouping

A single timestamp cannot distinguish arbitrarily many runs, but it can split the common case
for free: History shows a meso's sessions as **"Current run"** (on or after `activated_at`)
and **"Earlier"** (before it). That covers the A → B → A pattern the user described. With
three or more runs, every older block lumps into "Earlier" — the column only remembers the
latest activation. Accepted.

## Part D — title-case action labels

The app is currently mixed rather than uniformly sentence case: `"Log Weight"` and
`"Target Calories"` sit next to `"Start workout"`, `"Add exercise"` and `"New meso"`.

Convention, to be applied and recorded: **action labels are title case; prose is sentence
case.** Action labels are the strings that appear on buttons and menu actions. Prose —
confirmation questions, empty states, hints, error messages — stays as it is. So
`"Start workout"` becomes `"Start Workout"`, while `"Delete this meso?"` and
`"No mesocycles yet. Create your first."` are untouched.

Roughly 28 action-ish strings are candidates; each is judged individually against that rule
rather than swept mechanically, because the key-name heuristic that found them also matches
sentences such as `mesos.deleteConfirm`.

## Module boundaries

| File | Responsibility |
|---|---|
| `supabase/migrations/0011_meso_soft_delete_and_activation.sql` | **Create.** Two nullable columns. |
| `src/data/mesoRepo.ts` | **Modify.** Soft delete, deleted-aware listings, `activated_at` stamping. |
| `src/data/sessionRepo.ts` | **Modify.** Nullable `mesoId`; optional window; orphan count. |
| `src/data/exportRepo.ts` | **Modify.** Nullable `mesoId`. |
| `src/features/history/historyScope.ts` | **Create.** Pure: switcher options, default selection, run split. |
| `src/features/history/HistoryPage.tsx` | **Modify.** Switcher; export follows selection. |
| `src/features/mesos/ActivationDialog.tsx` | **Create.** The three-way choice. |
| `src/features/mesos/MesoListPage.tsx` | **Modify.** Route activation through the dialog. |
| `src/i18n/strings/en.json` | **Modify.** New strings; title-case pass. |

## Edge cases

- **No mesos and no orphans:** existing empty state.
- **Deleting the active meso:** `is_active` is cleared, so the workout screen correctly falls
  back to "no active meso".
- **Re-activating a never-trained meso:** silent, no dialog, no stamp.
- **A meso with sessions both before and after its `activated_at`:** the intended case — the
  panel and cadence see only the newer ones; History shows both groups.
- **`activated_at` in the future** (clock skew): **written from the client clock, not the
  server.** PostgREST cannot evaluate `now()` in a PATCH body and a column `default` does not
  fire on UPDATE, so server time would need an RPC or a `before update` trigger. This matters
  asymmetrically: `deleted_at` is only ever read as `is null`, so skew is irrelevant there, but
  `activated_at` is compared with `.gte` against `workout_session.started_at`, which *is*
  server-side (`default now()`). A device clock running fast therefore puts the window slightly
  in the future and can briefly hide a just-finished session from "Previous workout" and the
  deload count; a slow clock only widens the window harmlessly. Bounded by device skew — seconds
  on an NTP-synced phone — so accepted rather than guarded.
- **CSV filename for Unassigned:** slug `unassigned`.
- **Progress "This meso" range:** unchanged and unwindowed — it covers all runs of the active
  meso. Consistent with the export.

## Testing

Following this repo's precedent of testing pure logic and leaving Supabase queries unmocked
(`exportRepo.test.ts`):

- `historyScope.test.ts` — switcher option order; Unassigned present only when orphans exist;
  deleted mesos included; default-selection fallback chain (active → newest → Unassigned);
  the Current-run/Earlier split, including a session exactly on the boundary and a meso with
  `activated_at` null.
- `ActivationDialog.test.tsx` — the dialog takes only props (meso name, three callbacks), so
  it renders without a router, auth or Supabase. Asserts all three outcomes fire the right
  callback, and that the dialog is not shown for a meso with no completed sessions (that
  condition lives in `MesoListPage`, so the test covers the dialog's own contract only).
- No repo tests: the query changes are not unit-testable without mocking the query builder,
  which tests the mock.

## i18n

New keys: `history.mesoScope`, `history.unassigned`, `history.currentRun`, `history.earlier`,
`mesos.activateTitle`, `mesos.activateFresh`, `mesos.activateResume`, `mesos.activateBody`.
Plus the title-case pass over existing action labels.

## Out of scope

- **Restore / undelete.** Delete is one-way; recovering a soft-deleted meso is a one-line DB
  update if it is ever needed.
- **Comparing mesos side by side.**
- **Preventing new orphans at workout start.** `startSession` can still write `meso_id: null`
  when no meso is active; the Unassigned bucket catches that output rather than closing the
  path.
- **Scoping `getLastPerformance`.** Explicitly considered and rejected — see Part C.
- **A local development database.** A SQLite local backend was considered and **shelved as too
  large**: the repos depend on PostgREST-specific features (nested embeds, `!inner` filters,
  `(count)` aggregates, `upsert onConflict`) and on RLS as the entire authorization model,
  neither of which SQLite provides. The cheap path, if revisited, is `supabase start` (local
  Postgres + PostgREST + Auth in Docker), which needs no application code change, plus a
  dev-only login bypass guarded by `import.meta.env.DEV` so it cannot exist in a build.
