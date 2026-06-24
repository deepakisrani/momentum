# Bodyweight Trend Graph — Design

**Date:** 2026-06-21
**Status:** Approved (pending spec review)
**Feature:** #3 of 3. Reuses the `<LineChart>` and `chartScale` built in feature #2 (exercise progression). On branch `feat/workout-history`.

## Problem
The user logs bodyweight but can only see the latest value (on the User Metrics
screen). There's no way to see the trend over time.

## Goal
Show a bodyweight trend line on the **User Metrics** screen (`/goals`), updating
in place after a new weigh-in is logged.

## Scope
**In scope**
- A "Weight trend" section on `GoalsPage` (`/goals`) below the metrics list.
- Reuse `<LineChart>` (no chart changes) to plot all weigh-ins, oldest→newest.
- Refetch after the Log Weight modal saves.

**Out of scope**
- Range toggle (all-time only — YAGNI for a single series; trivial to add later).
- New chart features, goal-weight overlay, smoothing.

## Architecture
No new repo or domain logic — `weightRepo.listWeights(userId)` already returns
`WeightLogRow[]` (`{ id, user_id, logged_on: 'YYYY-MM-DD', weight_kg }`) sorted
by `logged_on` ascending. This is pure wiring on `GoalsPage`.

### `GoalsPage` changes (`src/features/profile/GoalsPage.tsx`)
- Local state `weights: WeightLogRow[] | null` (null = loading).
- A `loadWeights` callback calling `listWeights(session.user.id)`; invoked on
  mount (effect) and from the Log Weight modal's `onSaved` (alongside the
  existing `reload()`), so the chart updates in place.
- Map to chart points:
  `weights.map(w => ({ t: new Date(w.logged_on + 'T12:00:00').getTime(), v: u.toWeight(w.weight_kg) }))`
  (noon parse avoids timezone day-drift, matching the app's date convention).
- Render a "Weight trend" section:
  - `weights === null` → nothing (the screen's existing `latestWeight` guard
    means the page only renders once weight data is available; the chart section
    simply waits for its own fetch).
  - `points.length >= 1` → `<LineChart points={points}
    formatValue={(v) => `${v.toFixed(1)} ${u.weightLabel}`}
    formatDate={(ms) => shortDate(new Date(ms).toISOString())}
    yLabel={t('metrics.weightTrend')} />`.
  - `points.length < 2` → also show `t('metrics.notEnoughWeights')` beneath it.

### i18n (`src/i18n/strings/en.json`)
- `metrics.weightTrend` = "Weight trend"
- `metrics.notEnoughWeights` = "Log a couple more weigh-ins to see a trend."

## Edge cases
- **1 weigh-in** → single dot + the "not enough for a trend" note (mirrors #2).
- **Units** → `u.toWeight` / `u.weightLabel`; stored kg.
- **Fetch error** → caught; the chart section is omitted (the rest of User
  Metrics still renders). No separate error UI (it's a secondary panel).
- **Date parsing** → `logged_on + 'T12:00:00'` (local noon).

## Testing
No new pure logic (mapping is trivial; `<LineChart>` and `chartScale` are already
unit-tested). Verified via `npm run build`; the user eyeballs on desktop
(auth-gated).

## Files
- Edit: `src/features/profile/GoalsPage.tsx`, `src/i18n/strings/en.json`.
