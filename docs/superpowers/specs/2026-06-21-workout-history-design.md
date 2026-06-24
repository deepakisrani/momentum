# Workout History — Design

**Date:** 2026-06-21
**Status:** Approved (pending spec review)
**Feature:** #1 of 3 (workout history; exercise progression and bodyweight graph follow as separate specs)

## Problem

While training, there is no way to see what you did in previous workouts of the
running meso. The only reference is a one-line "last time" summary per exercise
in the active-workout view. You cannot review a whole past session, nor browse
your workout history outside of training. This makes progressive overload
guesswork and the app hard to use.

## Goal

Let the user:
1. **Mid-workout:** open a panel and thumb through previous sessions of the same
   day type (newest → older) to see exactly what they did.
2. **Anytime:** browse the running meso's completed sessions from a standalone
   History screen and open any one in full.

Both surfaces show the **same read-only session detail**, built once and reused.

## Scope

**In scope**
- Read-only viewing of completed sessions in the **active meso**.
- In-workout "Previous workout" slide-over panel, paging same-day sessions.
- Standalone `/history` list + `/history/:sessionId` detail.

**Out of scope**
- Per-exercise inline expand (explicitly dropped).
- Editing past sessions.
- History across non-active mesos.
- Exercise progression (#2) and bodyweight graph (#3) — separate specs.

## Architecture

Presentational core + thin data-fetching containers, following the existing
layered architecture (pure domain → data repos → feature UI).

### Shared core: `SessionDetailView` (presentational)

`src/features/history/SessionDetailView.tsx`

- **Props:** `{ full: SessionFull; exercisesById: Record<string, ExerciseRow> }`
- Renders, read-only:
  - **Header:** date, duration, and a **Deload** badge when `session.is_deload`.
  - **Each exercise** in `order_index` order: name (`exercisesById[se.exercise_id]?.name`, with a fallback), then its sets as `set# · weight × reps · RIR`, units-aware via `useUnits()`. An exercise with no logged sets shows a muted "no sets logged" line.
- No data fetching, no mutation — so it's trivially reusable and testable.

### Data layer additions

`src/data/sessionRepo.ts`
```ts
export interface SessionSummary {
  id: string
  meso_day_id: string | null
  started_at: string
  ended_at: string | null
  is_deload: boolean
  exerciseCount: number
}

// Completed sessions for a meso, newest first. Optional meso_day filter.
// Uses a PostgREST embedded count: select('..., session_exercise(count)').
export async function listMesoSessions(
  userId: string,
  mesoId: string,
  opts?: { mesoDayId?: string },
): Promise<SessionSummary[]>
```
- `getSessionFull(sessionId)` already exists and returns the full session — reused as-is for detail.

`src/data/exerciseRepo.ts`
```ts
// Fetch exercises by id (planned, custom, swapped, or added) for name display.
export async function getExercisesByIds(ids: string[]): Promise<Record<string, ExerciseRow>>
```

### Surface 1 — In-workout "Previous workout" panel

`src/features/history/PreviousWorkoutPanel.tsx`

- **Trigger:** a **"Previous"** button in the active-session header
  (`ActiveWorkoutPage`), alongside the existing Deload switch / END button.
- **Props:** `{ userId; mesoId; mesoDayId; dayLabel; onClose }`.
- **Behavior:**
  1. On open, `listMesoSessions(userId, mesoId, { mesoDayId })` → same-day
     completed sessions, newest first. (The active session is `in_progress`, so
     the `status = completed` filter excludes it.)
  2. Default to index 0 (most recent). Fetch its detail via `getSessionFull` +
     `getExercisesByIds`, render in `SessionDetailView`.
  3. **← Older / Newer →** paging moves the index and refetches detail.
  4. Panel header: `{dayLabel} · {shortDate} · {relativeDate}` for the shown session.
- **Empty state:** no same-day sessions → "No previous workout for this day yet."

### Surface 2 — Standalone History screen

- **Route `/history`** → `HistoryPage` (`src/features/history/HistoryPage.tsx`)
  - Resolve the active meso (`getActiveMeso`). None → "No active mesocycle." empty state.
  - `listMesoSessions(userId, mesoId)` (all day types). Build a `meso_day_id → label`
    map from the active meso's day rows (reusing the meso-with-days fetch the
    builder already uses, e.g. `getMesoFull(mesoId)` in `mesoRepo`; confirm exact
    name during planning).
  - List rows (newest first): `{dayLabel} · {shortDate}`, exercise count, Deload
    badge. Empty list → "No workouts logged in this meso yet."
  - Tap a row → navigate to `/history/:sessionId`.
- **Route `/history/:sessionId`** → `SessionHistoryDetailPage`
  - Fetch `getSessionFull` + `getExercisesByIds`, render `SessionDetailView`.
- **Nav:** a **History** card on the dashboard (`DashboardPage`), matching the
  existing Mesocycles / Exercises cards. `AppHeader` title map gets `/history`
  → `history.title`.

### Pure helpers (tested)

`src/features/history/historyFormat.ts`
- `shortDate(iso): string` — e.g. "16 Jun".
- `relativeDate(iso, now): string` — "today" / "yesterday" / "3 weeks ago".
- `formatDuration(startIso, endIso | null): string | null` — e.g. "1h 12m"; null if no end.

### i18n keys (`src/i18n/strings/en.json`)
- `workout.previous` = "Previous"
- `history.title` = "History"
- `history.empty` = "No workouts logged in this meso yet."
- `history.noActiveMeso` = "No active mesocycle."
- `history.noPreviousDay` = "No previous workout for this day yet."
- `history.older` = "Older", `history.newer` = "Newer"
- `history.deload` = "Deload"
- `history.exercises` = "exercises"
- `history.noSets` = "No sets logged."

## Data flow

```
ActiveWorkoutPage ──"Previous"──▶ PreviousWorkoutPanel
                                    └─ listMesoSessions(mesoDayId) ─▶ [summaries]
                                    └─ getSessionFull + getExercisesByIds ─▶ SessionDetailView

DashboardPage ──"History"──▶ /history (HistoryPage)
                               └─ getActiveMeso ─▶ mesoId + day-label map
                               └─ listMesoSessions ─▶ [summaries] ─▶ rows
                                                              └─tap─▶ /history/:id
                                                                       └─ getSessionFull + getExercisesByIds ─▶ SessionDetailView
```

## Edge cases
- **No active meso / no sessions:** explicit empty states (above).
- **Added/swapped exercises** in a past session: rendered like any other; names
  resolved via `getExercisesByIds` (includes custom exercises).
- **Missing exercise name:** fallback label so the row still renders.
- **Repo errors:** caught, surfaced as `t('common.error')`, matching existing screens.
- **Units:** all weights display per `profile.units_pref` via `useUnits()`.

## Testing
- Unit tests for `historyFormat.ts` (`shortDate`, `relativeDate`, `formatDuration`)
  including boundaries (today/yesterday, missing end time).
- Repos stay at the Supabase boundary (not unit-tested), consistent with the codebase.
- Optional light render test of `SessionDetailView` with a fixture `SessionFull`.

## Files
- New: `src/features/history/SessionDetailView.tsx`, `PreviousWorkoutPanel.tsx`,
  `HistoryPage.tsx`, `SessionHistoryDetailPage.tsx`, `historyFormat.ts`,
  `historyFormat.test.ts`.
- Edit: `src/data/sessionRepo.ts` (+`listMesoSessions`), `src/data/exerciseRepo.ts`
  (+`getExercisesByIds`), `src/features/session/ActiveWorkoutPage.tsx` (Previous
  button + panel), `src/features/profile/DashboardPage.tsx` (History card),
  `src/components/AppHeader.tsx` (title map), `src/App.tsx` (routes),
  `src/i18n/strings/en.json` (keys).
```
