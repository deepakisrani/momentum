# Exercise Progression — Design

**Date:** 2026-06-21
**Status:** Approved (pending spec review)
**Feature:** #2 of 3 (after workout history; the bodyweight graph #3 reuses this feature's `<LineChart>`).

## Problem

There is no way to see whether an exercise is progressing over time. The user
wants to pick an exercise and see its trend — strength and volume — across
sessions, so progressive overload isn't guesswork.

## Goal

A dedicated **Progress** area:
1. Pick from the exercises you've actually trained.
2. See that exercise's trend as a line chart, toggleable between **Est. 1RM**
   and **Volume**, and between **All time** and **This meso**.

The chart is a generic, reusable SVG component so the bodyweight graph (#3) uses
it unchanged.

## Scope

**In scope**
- Dedicated `/progress` list (trained exercises) + `/progress/:exerciseId` detail.
- Metric toggle: Est. 1RM (Epley, from the top set) / Volume (session total).
- Range toggle: All time (all mesos) / This meso (the active meso).
- **Deload sessions are excluded from the trend** (intentional backoffs, not progression).
- Reusable `<LineChart>` SVG component + pure scale/path/metric helpers.

**Out of scope**
- Bodyweight graph (#3 — separate spec, reuses `<LineChart>`).
- Per-set/PR tables, sharing/export, multi-exercise comparison.
- Smoothing/regression trend lines.

## Architecture

Pure domain (metrics) → data repo (fetch + shape) → presentational chart + feature screens.

### Pure metrics — `src/domain/progressMetrics.ts` (tested)

```ts
export interface ProgressionPoint { date: string; e1rm: number; volume: number }
interface SetRow { sessionId: string; date: string; weight: number; reps: number }

export function epley1RM(weight: number, reps: number): number // weight * (1 + reps/30)

// Groups flat set rows by session, computes per-session top-set Est.1RM (max
// epley over the session's sets) and volume (Σ weight*reps), sorted oldest→newest.
export function summarizeSessions(rows: SetRow[]): ProgressionPoint[]
```

All weights are kg here (stored unit); display conversion happens in the UI.

### Chart — `src/components/charts/` (shared, reused by #3)

- `chartScale.ts` (tested):
  - `linScale(dMin, dMax, rMin, rMax): (v: number) => number`
  - `linePath(points: { x: number; y: number }[]): string` (SVG `d`)
- `LineChart.tsx` — pure presentational SVG:
  - **Props:** `{ points: { t: number; v: number }[]; formatValue: (v: number) => string; formatDate: (t: number) => string; yLabel?: string }` (`t` = epoch ms, `v` = display value).
  - Renders a responsive SVG (`viewBox` + `width:100%`): line + dots, y-axis min/max labels, first/last x date labels, brand-themed and dark-mode aware.
  - Tap/click a dot → selects it and shows its `formatDate(t) · formatValue(v)` in a caption above the chart. Selected dot is emphasized.
  - Degenerate input: 0 points → renders nothing (caller shows empty state); 1 point → renders the single dot (no line).

### Data — `src/data/progressRepo.ts` (new)

```ts
export interface TrainedExercise { exerciseId: string; name: string; lastTrained: string }

// Exercises that appear in the user's completed sessions, with name + most-recent
// date, newest first. (All-time; the range toggle only affects the detail chart.)
export async function listTrainedExercises(userId: string): Promise<TrainedExercise[]>

// Flat set rows for one exercise from completed, NON-deload sessions, optionally
// restricted to one meso. Caller passes these to summarizeSessions().
export async function getExerciseSetRows(
  userId: string,
  exerciseId: string,
  opts?: { mesoId?: string },
): Promise<{ sessionId: string; date: string; weight: number; reps: number }[]>
```

- `listTrainedExercises`: query `session_exercise` inner-joined to `workout_session`
  (`user_id`, `status = completed`); dedupe to `{exerciseId → max(started_at)}` in JS;
  resolve names via `getExercisesByIds`; sort by date desc.
- `getExerciseSetRows`: query `set_segment` joined up through `logged_set →
  session_exercise → workout_session`, filtered `exercise_id`, `user_id`,
  `status = completed`, `is_deload = false`, and optional `meso_id`; map each
  segment to `{ sessionId, date: started_at, weight, reps }`. `date` uses the
  session's `started_at`. The feature passes the result to `summarizeSessions`.

### Screens — `src/features/progress/`

- **`/progress` → `ProgressPage`:** a **Progress** card on the dashboard opens it.
  Search box + list of `listTrainedExercises` (name + last-trained date), newest
  first, filtered client-side by the search box. Empty → `progress.empty`. Tap a
  row → `/progress/:exerciseId`.
- **`/progress/:exerciseId` → `ExerciseProgressPage`:**
  - Loads the exercise (name via `getExercisesByIds`) and, on mount + whenever the
    range changes, `getExerciseSetRows(userId, exerciseId, { mesoId? })` →
    `summarizeSessions`.
  - **Metric toggle** (Est. 1RM | Volume) selects which field maps to the chart's `v`.
  - **Range toggle** (All time | This meso): "This meso" passes the active meso's
    id (`getActiveMeso`); hidden/disabled when there is no active meso (default All time).
  - Maps points to `{ t: Date(date).getTime(), v: metric }`, converts weight via
    `useUnits()` (`u.toWeight` for both Est.1RM and Volume; label `u.weightLabel`),
    renders `<LineChart>` + the latest value.
  - `< 2` points after filtering → `progress.notEnoughData` (a single point still
    shows its value).

### Navigation & routing
- `src/App.tsx`: add `/progress` and `/progress/:exerciseId` inside the
  `RequireOnboarding`/`AppLayout` group.
- `src/components/AppHeader.tsx`: `/progress` → `progress.title`;
  `startsWith('/progress/')` → `progress.title` (exercise name shown as the page H1).
- `src/features/profile/DashboardPage.tsx`: add a **Progress** card (it joins
  Mesos/Exercises/History in the responsive grid).

### i18n keys (`src/i18n/strings/en.json`)
- `progress.title` = "Progress"
- `progress.empty` = "No exercises trained yet."
- `progress.search` = "Search exercises"
- `progress.notEnoughData` = "Not enough data yet — log a couple more sessions."
- `progress.metric.e1rm` = "Est. 1RM"
- `progress.metric.volume` = "Volume"
- `progress.range.all` = "All time"
- `progress.range.meso` = "This meso"
- `progress.latest` = "Latest"

## Data flow
```
DashboardPage ──"Progress"──▶ /progress (ProgressPage)
                                └─ listTrainedExercises ─▶ rows (search-filtered) ─tap─▶ /progress/:id
/progress/:id (ExerciseProgressPage)
   metric toggle (e1rm|volume) ─┐
   range toggle (all|this meso) ─┴─▶ getExerciseSetRows(opts) ─▶ summarizeSessions ─▶ points
                                                    └─ map+useUnits ─▶ <LineChart>
```

## Edge cases
- **No trained exercises** → `progress.empty`.
- **No active meso** → "This meso" toggle hidden; All time only.
- **0 points in range** (e.g. only deload sessions, or none this meso) → `progress.notEnoughData`.
- **1 point** → show the value; chart renders the single dot, no trend line.
- **Deloads** → excluded from `getExerciseSetRows` (`is_deload = false`); still visible in History.
- **Units** → all display via `useUnits()`; stored/computed in kg.
- **Repo errors** → caught, `t('common.error')`, matching existing screens.

## Testing
- `progressMetrics.ts`: `epley1RM` (incl. reps=1, high reps); `summarizeSessions`
  (grouping by session, top-set Est.1RM = max epley, volume sum, oldest→newest sort,
  empty input).
- `chartScale.ts`: `linScale` (incl. flat domain min==max → no divide-by-zero),
  `linePath` (0/1/many points).
- Repos & components verified via `npm run build` (auth-gated; user eyeballs).

## Files
- New: `src/domain/progressMetrics.ts` (+ test), `src/components/charts/chartScale.ts`
  (+ test), `src/components/charts/LineChart.tsx`, `src/data/progressRepo.ts`,
  `src/features/progress/ProgressPage.tsx`, `src/features/progress/ExerciseProgressPage.tsx`.
- Edit: `src/App.tsx`, `src/components/AppHeader.tsx`,
  `src/features/profile/DashboardPage.tsx`, `src/i18n/strings/en.json`.
