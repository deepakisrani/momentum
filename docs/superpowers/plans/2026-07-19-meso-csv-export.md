# Current-meso CSV export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export CSV" button to the History page that downloads the active mesocycle's logged sets (one row per set) for analysis.

**Architecture:** One nested Supabase query rooted at `workout_session` (so it can't hit the 1000-row cap) flattened into a flat `MesoSetRow[]`; a pure generic `toCsv`; a pure `mesoRowsToCsv` that formats rows in the user's weight unit; a tiny `downloadTextFile` DOM util; and a button wired into `HistoryPage`.

**Tech Stack:** TypeScript, React, Supabase JS, Vitest. Read-only + client-side; no schema change.

Design spec: `docs/superpowers/specs/2026-07-19-meso-csv-export-design.md`

---

## File Structure

- `src/domain/csv.ts` — CREATE: pure `toCsv(headers, rows)`.
- `src/domain/csv.test.ts` — CREATE.
- `src/data/exportRepo.ts` — CREATE: `getMesoSetRows` (query) + exported pure `flattenMesoQuery` + `MesoSetRow` type.
- `src/data/exportRepo.test.ts` — CREATE: tests `flattenMesoQuery` only (pure).
- `src/features/history/mesoCsv.ts` — CREATE: pure `mesoRowsToCsv(rows, weightUnit, toWeight)`.
- `src/features/history/mesoCsv.test.ts` — CREATE.
- `src/lib/download.ts` — CREATE: `downloadTextFile` (side-effecting; not unit-tested).
- `src/features/history/HistoryPage.tsx` — MODIFY: keep the active meso in state, add the export button + handler.
- `src/i18n/strings/en.json` — MODIFY: add `history.exportCsv`, `history.exportEmpty`.

Commands (from `/Users/deepakisrani/Documents/momentum`):
- Single file: `npm test -- <path>`
- Full suite: `npm test`
- Build: `npm run build`

---

## Task 1: Pure CSV serializer

**Files:**
- Create: `src/domain/csv.ts`
- Test: `src/domain/csv.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('joins headers and rows with newlines', () => {
    expect(toCsv(['a', 'b'], [[1, 2], [3, 4]])).toBe('a,b\n1,2\n3,4')
  })
  it('quotes fields containing comma, quote, or newline and doubles interior quotes', () => {
    const csv = toCsv(['name', 'note'], [['Rope, cable', 'he said "hi"'], ['plain', 'line1\nline2']])
    expect(csv).toBe('name,note\n"Rope, cable","he said ""hi"""\nplain,"line1\nline2"')
  })
  it('emits an empty string cell as empty, not quoted', () => {
    expect(toCsv(['a', 'b'], [['', 'x']])).toBe('a,b\n,x')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/domain/csv.test.ts`
Expected: FAIL — `./csv` does not exist.

- [ ] **Step 3: Implement `src/domain/csv.ts`**

```ts
/** Serialize rows to RFC-4180 CSV. A field is quoted only when it contains a
 * comma, double-quote, or newline; interior double-quotes are doubled. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number): string => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))]
  return lines.join('\n')
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- src/domain/csv.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** (skip — the user handles git).

---

## Task 2: exportRepo — query + flatten

**Files:**
- Create: `src/data/exportRepo.ts`
- Test: `src/data/exportRepo.test.ts`

- [ ] **Step 1: Write the failing test for the pure flattener**

Create `src/data/exportRepo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { flattenMesoQuery, type QSession } from './exportRepo'

const sessions: QSession[] = [
  {
    started_at: '2026-07-10T06:00:00Z', is_deload: false, meso_day_id: 'd1',
    meso_day: { label: 'Push' },
    session_exercise: [
      {
        order_index: 1,
        exercise: { name: 'Bench, incline', muscle_group: 'chest' },
        logged_set: [
          { set_index: 0, set_segment: [{ segment_index: 0, weight: 60, reps: 8, rir: 2 }] },
          { set_index: 1, set_segment: [{ segment_index: 0, weight: 60, reps: 7, rir: null }] },
        ],
      },
      { order_index: 0, exercise: { name: 'Empty', muscle_group: 'x' }, logged_set: [] },
    ],
  },
  {
    started_at: '2026-07-08T06:00:00Z', is_deload: true, meso_day_id: null,
    meso_day: null,
    session_exercise: [
      { order_index: 0, exercise: null, logged_set: [{ set_index: 0, set_segment: [{ segment_index: 0, weight: 40, reps: 10, rir: 3 }] }] },
    ],
  },
]

describe('flattenMesoQuery', () => {
  it('flattens to sorted rows, resolving labels/names and numbering sets 1-based', () => {
    const rows = flattenMesoQuery(sessions)
    // earlier date first; the deload session (07-08) leads.
    expect(rows.map((r) => r.date)).toEqual([
      '2026-07-08T06:00:00Z', '2026-07-10T06:00:00Z', '2026-07-10T06:00:00Z',
    ])
    expect(rows[0]).toEqual({
      date: '2026-07-08T06:00:00Z', dayLabel: null, isDeload: true, exercise: '',
      muscleGroup: null, setNumber: 1, weightKg: 40, reps: 10, rir: 3,
    })
    // within the 07-10 push session, order_index 0 (Empty) has no sets, so only Bench rows appear, numbered 1 and 2
    expect(rows[1].exercise).toBe('Bench, incline')
    expect(rows[1].dayLabel).toBe('Push')
    expect(rows[1].setNumber).toBe(1)
    expect(rows[2].setNumber).toBe(2)
    expect(rows[2].rir).toBeNull()
  })
  it('returns an empty array for no sessions', () => {
    expect(flattenMesoQuery([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test -- src/data/exportRepo.test.ts`
Expected: FAIL — `./exportRepo` does not exist.

- [ ] **Step 3: Implement `src/data/exportRepo.ts`**

```ts
import { supabase } from '../lib/supabase'

// Shape of the nested select response (only the fields we request).
export interface QSegment { segment_index: number; weight: number; reps: number; rir: number | null }
export interface QSet { set_index: number; set_segment: QSegment[] }
export interface QExercise { order_index: number; exercise: { name: string; muscle_group: string } | null; logged_set: QSet[] }
export interface QSession {
  started_at: string
  is_deload: boolean
  meso_day_id: string | null
  meso_day: { label: string } | null
  session_exercise: QExercise[]
}

export interface MesoSetRow {
  date: string
  dayLabel: string | null
  isDeload: boolean
  exercise: string
  muscleGroup: string | null
  setNumber: number
  weightKg: number
  reps: number
  rir: number | null
}

/** Flatten the nested meso query into sorted, one-row-per-segment records.
 * Sort: date asc, then exercise order_index, then set_index, then segment_index.
 * setNumber is a 1-based ordinal within each (session, exercise). */
export function flattenMesoQuery(sessions: QSession[]): MesoSetRow[] {
  const rows: MesoSetRow[] = []
  const byDate = [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at))
  for (const s of byDate) {
    const exercises = [...(s.session_exercise ?? [])].sort((a, b) => a.order_index - b.order_index)
    for (const se of exercises) {
      const sets = [...(se.logged_set ?? [])].sort((a, b) => a.set_index - b.set_index)
      let setNumber = 0
      for (const ls of sets) {
        setNumber += 1
        const segs = [...(ls.set_segment ?? [])].sort((a, b) => a.segment_index - b.segment_index)
        for (const seg of segs) {
          rows.push({
            date: s.started_at,
            dayLabel: s.meso_day?.label ?? null,
            isDeload: s.is_deload,
            exercise: se.exercise?.name ?? '',
            muscleGroup: se.exercise?.muscle_group ?? null,
            setNumber,
            weightKg: seg.weight,
            reps: seg.reps,
            rir: seg.rir,
          })
        }
      }
    }
  }
  return rows
}

/** Fetch all completed logged sets for one meso in a single nested query. */
export async function getMesoSetRows(userId: string, mesoId: string): Promise<MesoSetRow[]> {
  const { data, error } = await supabase
    .from('workout_session')
    .select(
      'started_at, is_deload, meso_day_id, meso_day ( label ), session_exercise ( order_index, exercise ( name, muscle_group ), logged_set ( set_index, set_segment ( segment_index, weight, reps, rir ) ) )',
    )
    .eq('user_id', userId)
    .eq('meso_id', mesoId)
    .eq('status', 'completed')
    .order('started_at', { ascending: true })
  if (error) throw error
  return flattenMesoQuery((data ?? []) as unknown as QSession[])
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- src/data/exportRepo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit** (skip — the user handles git).

---

## Task 3: mesoCsv — format rows into CSV

**Files:**
- Create: `src/features/history/mesoCsv.ts`
- Test: `src/features/history/mesoCsv.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/history/mesoCsv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mesoRowsToCsv } from './mesoCsv'
import type { MesoSetRow } from '../../data/exportRepo'

const rows: MesoSetRow[] = [
  { date: '2026-07-08T06:00:00Z', dayLabel: 'Push', isDeload: true, exercise: 'Bench', muscleGroup: 'chest', setNumber: 1, weightKg: 60, reps: 8, rir: 2 },
  { date: '2026-07-08T06:00:00Z', dayLabel: null, isDeload: false, exercise: 'Row', muscleGroup: null, setNumber: 2, weightKg: 50, reps: 10, rir: null },
]

describe('mesoRowsToCsv', () => {
  it('writes the header, converts weight via the injected fn, and formats fields', () => {
    const csv = mesoRowsToCsv(rows, 'lb', (kg) => kg * 2) // stub converter
    const lines = csv.split('\n')
    expect(lines[0]).toBe('date,day,deload,exercise,muscle_group,set,weight,weight_unit,reps,rir')
    expect(lines[1]).toBe('2026-07-08,Push,true,Bench,chest,1,120,lb,8,2')
    // null day -> empty, null muscle -> empty, null rir -> empty, deload false
    expect(lines[2]).toBe('2026-07-08,,false,Row,,2,100,lb,10,')
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test -- src/features/history/mesoCsv.test.ts`
Expected: FAIL — `./mesoCsv` does not exist.

- [ ] **Step 3: Implement `src/features/history/mesoCsv.ts`**

```ts
import { toCsv } from '../../domain/csv'
import type { MesoSetRow } from '../../data/exportRepo'

const HEADERS = ['date', 'day', 'deload', 'exercise', 'muscle_group', 'set', 'weight', 'weight_unit', 'reps', 'rir']

/** Format meso set rows as CSV. `toWeight` converts kg to the display unit;
 * `weightUnit` is that unit's label (e.g. 'kg' | 'lb'). */
export function mesoRowsToCsv(rows: MesoSetRow[], weightUnit: string, toWeight: (kg: number) => number): string {
  const matrix: (string | number)[][] = rows.map((r) => [
    r.date.slice(0, 10),
    r.dayLabel ?? '',
    r.isDeload ? 'true' : 'false',
    r.exercise,
    r.muscleGroup ?? '',
    r.setNumber,
    toWeight(r.weightKg),
    weightUnit,
    r.reps,
    r.rir ?? '',
  ])
  return toCsv(HEADERS, matrix)
}
```

Note on `date`: `r.date` is an ISO timestamp string. `.slice(0, 10)` yields the `YYYY-MM-DD` prefix. The stored `started_at` is UTC; a same-day local session is the common case and the date prefix is correct for it. Using the string prefix (not `new Date`) keeps this pure and timezone-stable for the test.

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- src/features/history/mesoCsv.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit** (skip — the user handles git).

---

## Task 4: downloadTextFile util

**Files:**
- Create: `src/lib/download.ts`

- [ ] **Step 1: Implement `src/lib/download.ts`**

(No unit test: this is a DOM/Blob side effect; it is exercised by the build and manual/preview check.)

```ts
/** Trigger a browser download of `text` as a file. */
export function downloadTextFile(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: `✓ built`, no errors.

- [ ] **Step 3: Commit** (skip — the user handles git).

---

## Task 5: Wire the export button into HistoryPage + i18n

**Files:**
- Modify: `src/i18n/strings/en.json`
- Modify: `src/features/history/HistoryPage.tsx`

- [ ] **Step 1: Add i18n keys**

In `src/i18n/strings/en.json`, after the line `"history.deload": "Deload",` add:

```json
  "history.exportCsv": "Export CSV",
  "history.exporting": "Exporting…",
```

(There is already a trailing key block; ensure the comma placement stays valid JSON.)

- [ ] **Step 2: Replace `src/features/history/HistoryPage.tsx` with the version below**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { getActiveMeso, getMesoFull } from '../../data/mesoRepo'
import { listMesoSessions, type SessionSummary } from '../../data/sessionRepo'
import { getMesoSetRows } from '../../data/exportRepo'
import { mesoRowsToCsv } from './mesoCsv'
import { downloadTextFile } from '../../lib/download'
import { useUnits } from '../profile/useUnits'
import type { MesoRow } from '../../data/rows'
import { shortDate } from './historyFormat'

export function HistoryPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const { weightLabel, toWeight } = useUnits()
  const [meso, setMeso] = useState<MesoRow | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [dayLabels, setDayLabels] = useState<Record<string, string>>({})
  const [hasMeso, setHasMeso] = useState(true)
  const [error, setError] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    (async () => {
      const m = await getActiveMeso(userId)
      if (!m) { setHasMeso(false); setSessions([]); return }
      setMeso(m)
      const [full, list] = await Promise.all([getMesoFull(m.id), listMesoSessions(userId, m.id)])
      setDayLabels(Object.fromEntries(full.days.map((d) => [d.id, d.label])))
      setSessions(list)
    })().catch(() => { setError(true); setSessions([]) })
  }, [userId])

  async function onExport() {
    if (!meso) return
    setExporting(true)
    try {
      const rows = await getMesoSetRows(userId, meso.id)
      const csv = mesoRowsToCsv(rows, weightLabel, toWeight)
      const slug = meso.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'meso'
      const date = new Date().toISOString().slice(0, 10)
      downloadTextFile(`momentum-${slug}-${date}.csv`, csv)
    } catch {
      setError(true)
    } finally {
      setExporting(false)
    }
  }

  if (sessions === null) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-4xl space-y-2">
        {error ? (
          <p className="text-sm text-red-500">{t('common.error')}</p>
        ) : !hasMeso ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.noActiveMeso')}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.empty')}</p>
        ) : (
          <>
            <div className="flex justify-end">
              <button
                onClick={onExport}
                disabled={exporting}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 dark:bg-[#1b2030]"
              >
                {exporting ? t('history.exporting') : t('history.exportCsv')}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/history/${s.id}`)}
                className="flex w-full items-center justify-between rounded-xl bg-slate-100 px-4 py-3 text-left dark:bg-[#1b2030]"
              >
                <div>
                  <div className="font-semibold">{s.meso_day_id ? dayLabels[s.meso_day_id] ?? '—' : '—'}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{shortDate(s.started_at)} · {s.exerciseCount} {t('history.exercises')}</div>
                </div>
                {s.is_deload && (
                  <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{t('history.deload')}</span>
                )}
              </button>
            ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

Changes vs. the current file: added `useUnits`, `getMesoSetRows`, `mesoRowsToCsv`, `downloadTextFile`, `MesoRow` imports; added `meso`/`exporting` state; store the meso in the effect; added `onExport`; wrapped the session grid in a fragment with an export button shown only in the has-sessions branch (so it is implicitly hidden when there is no meso or zero sessions).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`, no TypeScript errors.

- [ ] **Step 4: Commit** (skip — the user handles git).

---

## Task 6: Full verification

**Files:** none.

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all pass (previous total plus csv (3) + exportRepo (2) + mesoCsv (1) new tests).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Manual note**

The download itself (`downloadTextFile`) and the button are behind auth (History requires a signed-in user with an active meso), so they can't be driven headlessly. Note for the user to click Export on the History page and confirm a `momentum-<meso>-<date>.csv` downloads with the expected header row and one line per logged set.

---

## Self-Review

**Spec coverage:**
- Single nested query rooted at `workout_session`, 1000-row-safe → Task 2 `getMesoSetRows`.
- Flatten to sorted one-row-per-set records → Task 2 `flattenMesoQuery` + test.
- Pure CSV with RFC-4180 escaping → Task 1 `toCsv` + test.
- Actuals-only column set, display unit + `weight_unit`, deload true/false, rir empty, 1-based set → Task 3 `mesoRowsToCsv` + test.
- Download via Blob/`<a download>` → Task 4 `downloadTextFile`.
- Button on History page, enabled only with an active meso + ≥1 session, busy/error handling → Task 5.
- i18n keys → Task 5.
- Edge cases (no meso / zero sessions hide the button; empty-set exercise yields no rows; escaping) → Task 5 branch structure, Task 2 test (empty-set exercise), Task 1 test (escaping).

**Placeholder scan:** none — every step has concrete code or an exact command + expected output.

**Type consistency:** `MesoSetRow` defined in `exportRepo.ts` and imported by `mesoCsv.ts` and its test; `QSession` exported for the test; `mesoRowsToCsv(rows, weightUnit, toWeight)` matches the `HistoryPage` call `mesoRowsToCsv(rows, weightLabel, toWeight)` where `weightLabel`/`toWeight` come from `useUnits()`; `getMesoSetRows(userId, mesoId)` matches its call site; `toCsv(headers, rows)` signature consistent across Task 1 and Task 3.
