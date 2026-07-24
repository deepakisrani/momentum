# Current-meso CSV export — design

**Date:** 2026-07-19
**Status:** Approved (design)

## Problem

There is no way to get workout data out of Momentum. The user wants to export the
current mesocycle's logged sets as a CSV to hand to an LLM (or any tool) for
analysis. The meso is uncapped in length, so the export must scale without an N+1
fetch or a silent row-count truncation.

## Requirements

Confirmed during brainstorming:

1. **Scope:** the current (active) mesocycle only — the one with `meso.is_active`.
2. **Granularity:** one row per logged set (long format), **actuals only** — no
   planned targets.
3. **Units:** weights in the user's display unit (kg or lb) with an explicit
   `weight_unit` column.
4. **Location:** an "Export CSV" button on the History page.
5. **Performance:** a single query (not N+1), rooted so it cannot hit the
   PostgREST 1000-row default limit.

## Approach

One Supabase request rooted at `workout_session`, with the rest embedded through
foreign keys. Rooting at the session (not at `set_segment`) keeps the top-level row
count at "number of sessions" — comfortably under the 1000-row cap — while nested
sets ride along per session. All transformation logic is pure and unit-tested; only
the query and the browser download touch the outside world.

Query:

```
from('workout_session')
  .select(`started_at, is_deload, meso_day_id,
           meso_day ( label ),
           session_exercise ( order_index,
             exercise ( name, muscle_group ),
             logged_set ( set_index,
               set_segment ( segment_index, weight, reps, rir ) ) )`)
  .eq('user_id', userId).eq('meso_id', mesoId).eq('status', 'completed')
  .order('started_at', { ascending: true })
```

Nested array ordering (exercises, sets, segments) is done in the flatten step, not
in SQL.

## Module boundaries

- **`src/data/exportRepo.ts`**
  - `getMesoSetRows(userId, mesoId): Promise<MesoSetRow[]>` — runs the query and
    returns the flattened rows.
  - `flattenMesoQuery(sessions): MesoSetRow[]` — exported pure helper mapping the
    nested response to a flat, sorted array (unit-tested against a mock response).
  - `MesoSetRow = { date: string; dayLabel: string | null; isDeload: boolean; exercise: string; muscleGroup: string | null; setNumber: number; weightKg: number; reps: number; rir: number | null }`
    (`date` is the session `started_at` ISO string; weight stays in kg here).
  - Sort order: `date` asc, then `session_exercise.order_index`, then
    `logged_set.set_index`, then `set_segment.segment_index`. `setNumber` is a
    1-based ordinal within each (session, exercise), assigned during flatten from
    the sorted set position, so it is independent of the stored `set_index` base.
- **`src/domain/csv.ts`**
  - `toCsv(headers: string[], rows: (string | number)[][]): string` — pure,
    RFC-4180 escaping: a field is quoted when it contains a comma, double-quote, or
    newline; interior double-quotes are doubled. Rows joined with `\n`.
- **`src/features/history/mesoCsv.ts`**
  - `mesoRowsToCsv(rows: MesoSetRow[], weightUnit: string, toWeight: (kg: number) => number): string`
    — maps `MesoSetRow[]` to the header + string matrix, then calls `toCsv`.
  - Column order: `date, day, deload, exercise, muscle_group, set, weight, weight_unit, reps, rir`.
  - Field rules: `date` -> local `YYYY-MM-DD`; `day` -> `dayLabel ?? ''`;
    `deload` -> `'true' | 'false'`; `muscle_group` -> `muscleGroup ?? ''`;
    `set` -> `setNumber` (the 1-based ordinal assigned during flatten);
    `weight` -> `toWeight(weightKg)`; `weight_unit` -> `weightUnit`; `rir` -> `''`
    when null.
  - One row per `set_segment`. v1 is single-segment (the app always writes
    `segment_index: 0`), so this is effectively one row per set; a future drop-set
    would emit multiple rows sharing the same `set` ordinal. Acceptable.
- **`src/lib/download.ts`**
  - `downloadTextFile(filename: string, text: string, mime = 'text/csv'): void` —
    `Blob` + `URL.createObjectURL` + a programmatic `<a download>` click +
    `revokeObjectURL`.
- **`src/features/history/HistoryPage.tsx`**
  - Add an "Export CSV" button, enabled only when the active meso has >= 1 completed
    session (HistoryPage already loads the session summaries). Busy/error handling
    mirrors `SettingsPage` (async handler, `busy` flag, `error` string on catch).
  - On click: `getMesoSetRows(userId, meso.id)` -> `mesoRowsToCsv(rows, weightLabel, toWeight)`
    -> `downloadTextFile('momentum-' + slug(meso.name) + '-' + YYYYMMDD + '.csv', csv)`.
  - `weightLabel` (`'kg'`/`'lb'`) and `toWeight` come from `useUnits()` (already used
    in `SessionDetailView`).

## Edge cases

- No active meso: the button is not rendered (HistoryPage's existing no-meso empty
  state covers this).
- Active meso with zero completed sessions: button disabled; nothing to download.
- `session_exercise` with no logged sets: contributes no rows.
- Values with commas/quotes/newlines (e.g. long exercise names): quoted/escaped by
  `toCsv`.
- Row-count safety: top-level rows = sessions (well under 1000); nested sets are not
  subject to the top-level limit. No pagination needed.

## Testing (Vitest)

- `toCsv`: escaping (comma, embedded double-quote, newline, empty string); header +
  rows; numeric cells.
- `flattenMesoQuery`: nested mock -> flat rows in the correct sort order; null
  `meso_day` -> null `dayLabel`; null `muscle_group`; null `rir`; set-ordinal
  numbering across multiple sets; multiple sessions ordered by date; empty-set
  exercise yields nothing.
- `mesoRowsToCsv`: header names/order; `deload` true/false; weight converted via an
  injected `toWeight` stub; `weight_unit` column; date formatted to `YYYY-MM-DD`;
  `rir` empty when null.
- `downloadTextFile`: not unit-tested (DOM/Blob side effect); verified via build and
  noted for manual/preview check.

## i18n

Button label and its in-flight state go through `src/i18n/strings/en.json`
(`history.exportCsv`, `history.exporting`). The button renders only in the
has-sessions branch, so no "nothing to export" copy is needed. Data values
(exercise names, muscle groups) are data, not UI copy, so they are not translated.

## Out of scope

- Exporting more than the active meso (all-history export).
- Planned targets / plan-vs-actual columns.
- JSON or other formats.
- Any schema/DB change — this is read-only plus client-side serialization.
