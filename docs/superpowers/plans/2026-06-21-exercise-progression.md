# Exercise Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Progress area where the user picks a trained exercise and sees its Est. 1RM / Volume trend over time (all-time or current-meso), drawn with a reusable hand-rolled SVG line chart.

**Architecture:** Pure metric helpers (`progressMetrics.ts`) and pure chart-scale helpers (`chartScale.ts`) are TDD'd; a presentational `<LineChart>` consumes them; a new `progressRepo` fetches/​shapes data from Supabase; two feature screens wire it together. Deload sessions are excluded from the trend.

**Tech Stack:** Vite + React + TypeScript + Tailwind, Supabase (PostgREST), Vitest. Build: `npm run build` (`tsc -b` then Vite). This work continues on branch `feat/workout-history`.

---

## Conventions (read first)
- **Verification:** pure helpers are TDD'd with Vitest (`npm test`). Repos (Supabase boundary) and React components are verified with `npm run build` — not unit-tested — matching the codebase.
- **i18n:** all copy via `useT()` → `t('key')`; keys in `src/i18n/strings/en.json` (flat dotted JSON).
- **Units:** weights stored kg, displayed via `useUnits()` (`u.toWeight(kg)`, `u.weightLabel`).
- **Styling:** active toggle `bg-brand-600 text-white`; cards `bg-slate-100 dark:bg-[#1b2030]`; page surface `bg-white dark:bg-[#0f1115]`; list frame `mx-auto max-w-4xl`, focused `max-w-2xl`.
- **Reuse:** `getExercisesByIds` (src/data/exerciseRepo.ts), `getActiveMeso` (src/data/mesoRepo.ts), `shortDate` (src/features/history/historyFormat.ts) already exist on this branch.

## File Structure
- **Create** `src/domain/progressMetrics.ts` (+ test) — pure: Epley + per-session summarize.
- **Create** `src/components/charts/chartScale.ts` (+ test) — pure: linear scale + SVG path.
- **Create** `src/components/charts/LineChart.tsx` — presentational SVG chart (reused by #3).
- **Create** `src/data/progressRepo.ts` — `listTrainedExercises`, `getExerciseSetRows`.
- **Create** `src/features/progress/ProgressPage.tsx` — trained-exercise list.
- **Create** `src/features/progress/ExerciseProgressPage.tsx` — chart + toggles.
- **Modify** `src/i18n/strings/en.json`, `src/App.tsx`, `src/components/AppHeader.tsx`, `src/features/profile/DashboardPage.tsx`.

---

## Task 1: Pure progression metrics

**Files:**
- Create: `src/domain/progressMetrics.ts`
- Test: `src/domain/progressMetrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/progressMetrics.test.ts
import { describe, it, expect } from 'vitest'
import { epley1RM, summarizeSessions, type SetRow } from './progressMetrics'

describe('epley1RM', () => {
  it('equals the weight at 0 reps', () => { expect(epley1RM(100, 0)).toBeCloseTo(100) })
  it('applies the Epley factor', () => { expect(epley1RM(100, 10)).toBeCloseTo(133.333, 2) })
})

describe('summarizeSessions', () => {
  it('returns [] for no rows', () => { expect(summarizeSessions([])).toEqual([]) })

  it('groups by session (top-set 1RM, summed volume) sorted oldest first', () => {
    const rows: SetRow[] = [
      { sessionId: 's2', date: '2026-02-01T10:00:00Z', weight: 100, reps: 5 },
      { sessionId: 's1', date: '2026-01-01T10:00:00Z', weight: 80, reps: 8 },
      { sessionId: 's1', date: '2026-01-01T10:00:00Z', weight: 90, reps: 5 },
    ]
    const out = summarizeSessions(rows)
    expect(out.map((p) => p.date)).toEqual(['2026-01-01T10:00:00Z', '2026-02-01T10:00:00Z'])
    expect(out[0].e1rm).toBeCloseTo(105, 2)      // max(epley(80,8)=101.33, epley(90,5)=105)
    expect(out[0].volume).toBe(1090)             // 80*8 + 90*5
    expect(out[1].e1rm).toBeCloseTo(116.667, 2)  // epley(100,5)
    expect(out[1].volume).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- progressMetrics`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement**

```ts
// src/domain/progressMetrics.ts
export interface SetRow { sessionId: string; date: string; weight: number; reps: number }
export interface ProgressionPoint { date: string; e1rm: number; volume: number }

/** Epley estimated 1RM: weight * (1 + reps/30). */
export function epley1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

/** Group flat set rows by session: top-set Est.1RM + total volume, oldest→newest. */
export function summarizeSessions(rows: SetRow[]): ProgressionPoint[] {
  const bySession = new Map<string, ProgressionPoint>()
  for (const r of rows) {
    const e = epley1RM(r.weight, r.reps)
    const vol = r.weight * r.reps
    const cur = bySession.get(r.sessionId)
    if (!cur) bySession.set(r.sessionId, { date: r.date, e1rm: e, volume: vol })
    else { cur.e1rm = Math.max(cur.e1rm, e); cur.volume += vol }
  }
  return [...bySession.values()].sort((a, b) => a.date.localeCompare(b.date))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- progressMetrics`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/progressMetrics.ts src/domain/progressMetrics.test.ts
git commit -m "feat(progress): pure progression metrics (epley, summarizeSessions)"
```

---

## Task 2: Pure chart-scale helpers

**Files:**
- Create: `src/components/charts/chartScale.ts`
- Test: `src/components/charts/chartScale.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/charts/chartScale.test.ts
import { describe, it, expect } from 'vitest'
import { linScale, linePath } from './chartScale'

describe('linScale', () => {
  it('maps domain to range linearly', () => {
    const s = linScale(0, 10, 0, 100)
    expect(s(0)).toBe(0); expect(s(5)).toBe(50); expect(s(10)).toBe(100)
  })
  it('maps a flat domain to the range minimum (no divide-by-zero)', () => {
    expect(linScale(5, 5, 0, 100)(5)).toBe(0)
  })
})

describe('linePath', () => {
  it('returns empty string for no points', () => { expect(linePath([])).toBe('') })
  it('emits a moveto for a single point', () => { expect(linePath([{ x: 1, y: 2 }])).toBe('M 1 2') })
  it('emits moveto + lineto for multiple points', () => {
    expect(linePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M 0 0 L 10 5')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- chartScale`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement**

```ts
// src/components/charts/chartScale.ts
/** Linear map from [dMin,dMax] to [rMin,rMax]; flat domain maps everything to rMin. */
export function linScale(dMin: number, dMax: number, rMin: number, rMax: number): (v: number) => number {
  if (dMax === dMin) return () => rMin
  const m = (rMax - rMin) / (dMax - dMin)
  return (v: number) => rMin + (v - dMin) * m
}

/** SVG path `d` through points; '' for empty, single moveto for one point. */
export function linePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- chartScale`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/charts/chartScale.ts src/components/charts/chartScale.test.ts
git commit -m "feat(charts): pure linScale + linePath helpers"
```

---

## Task 3: `<LineChart>` SVG component

**Files:**
- Create: `src/components/charts/LineChart.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/charts/LineChart.tsx
import { useState } from 'react'
import { linScale, linePath } from './chartScale'

export interface ChartPoint { t: number; v: number } // t = epoch ms, v = display value

/** Reusable read-only line chart. Pure props (no context). */
export function LineChart({ points, formatValue, formatDate, yLabel }: {
  points: ChartPoint[]
  formatValue: (v: number) => string
  formatDate: (t: number) => string
  yLabel?: string
}) {
  const [sel, setSel] = useState<number | null>(null)
  if (points.length === 0) return null

  const W = 320, H = 180, padL = 40, padR = 12, padT = 16, padB = 24
  const xs = points.map((p) => p.t)
  const ys = points.map((p) => p.v)
  const sx = linScale(Math.min(...xs), Math.max(...xs), padL, W - padR)
  const sy = linScale(Math.min(...ys), Math.max(...ys), H - padB, padT)
  const xy = points.map((p) => ({ x: sx(p.t), y: sy(p.v) }))
  const selected = sel != null ? points[sel] : null

  return (
    <div className="space-y-2">
      <div className="h-5 text-center text-sm font-medium text-slate-600 dark:text-slate-300">
        {selected ? `${formatDate(selected.t)} · ${formatValue(selected.v)}` : (yLabel ?? '')}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" role="img">
        <text x="4" y={padT + 4} className="fill-slate-400 text-[9px]">{formatValue(Math.max(...ys))}</text>
        <text x="4" y={H - padB} className="fill-slate-400 text-[9px]">{formatValue(Math.min(...ys))}</text>
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
        {points.length > 1 && <path d={linePath(xy)} fill="none" className="stroke-brand-600" strokeWidth="2" />}
        {xy.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={sel === i ? 5 : 3.5} className="fill-brand-600" style={{ cursor: 'pointer' }} onClick={() => setSel(i)} />
        ))}
        <text x={padL} y={H - 6} className="fill-slate-400 text-[9px]">{formatDate(Math.min(...xs))}</text>
        <text x={W - padR} y={H - 6} textAnchor="end" className="fill-slate-400 text-[9px]">{formatDate(Math.max(...xs))}</text>
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: clean build, no TS errors. (If Tailwind `fill-brand-600`/`stroke-brand-600` don't apply visually later, that's a styling-only follow-up — the build is the gate here.)

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/LineChart.tsx
git commit -m "feat(charts): reusable LineChart SVG component"
```

---

## Task 4: `progressRepo` data reads

**Files:**
- Create: `src/data/progressRepo.ts`

- [ ] **Step 1: Implement**

```ts
// src/data/progressRepo.ts
import { supabase } from '../lib/supabase'
import { getExercisesByIds } from './exerciseRepo'
import type { SetRow } from '../domain/progressMetrics'

export interface TrainedExercise { exerciseId: string; name: string; lastTrained: string }

/** Exercises appearing in the user's completed sessions, newest-trained first. */
export async function listTrainedExercises(userId: string): Promise<TrainedExercise[]> {
  const { data, error } = await supabase
    .from('session_exercise')
    .select('exercise_id, workout_session!inner(user_id, status, started_at)')
    .eq('workout_session.user_id', userId)
    .eq('workout_session.status', 'completed')
  if (error) throw error
  type Raw = { exercise_id: string; workout_session: { started_at: string } }
  const latest = new Map<string, string>()
  for (const r of (data ?? []) as Raw[]) {
    const d = r.workout_session?.started_at
    if (!d) continue
    const cur = latest.get(r.exercise_id)
    if (!cur || d > cur) latest.set(r.exercise_id, d)
  }
  const ids = [...latest.keys()]
  if (!ids.length) return []
  const byId = await getExercisesByIds(ids)
  return ids
    .map((id) => ({ exerciseId: id, name: byId[id]?.name ?? '—', lastTrained: latest.get(id)! }))
    .sort((a, b) => b.lastTrained.localeCompare(a.lastTrained))
}

/** Flat set rows for one exercise from completed, NON-deload sessions; optional meso filter. */
export async function getExerciseSetRows(
  userId: string,
  exerciseId: string,
  opts?: { mesoId?: string },
): Promise<SetRow[]> {
  let q = supabase
    .from('set_segment')
    .select('weight, reps, logged_set!inner(session_exercise!inner(exercise_id, workout_session!inner(id, user_id, status, is_deload, meso_id, started_at)))')
    .eq('logged_set.session_exercise.exercise_id', exerciseId)
    .eq('logged_set.session_exercise.workout_session.user_id', userId)
    .eq('logged_set.session_exercise.workout_session.status', 'completed')
    .eq('logged_set.session_exercise.workout_session.is_deload', false)
  if (opts?.mesoId) q = q.eq('logged_set.session_exercise.workout_session.meso_id', opts.mesoId)
  const { data, error } = await q
  if (error) throw error
  type Raw = { weight: number; reps: number; logged_set: { session_exercise: { workout_session: { id: string; started_at: string } } } }
  return ((data ?? []) as Raw[]).map((r) => {
    const ws = r.logged_set.session_exercise.workout_session
    return { sessionId: ws.id, date: ws.started_at, weight: r.weight, reps: r.reps }
  })
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: clean build, no TS errors.

> Note for the human reviewer: the deep embedded-filter query in `getExerciseSetRows` (filtering on `logged_set.session_exercise.workout_session.*`) is the one thing that can only be runtime-verified against live data (it's behind auth). Build confirms types; correctness is confirmed when the user opens a chart.

- [ ] **Step 3: Commit**

```bash
git add src/data/progressRepo.ts
git commit -m "feat(progress): progressRepo (listTrainedExercises, getExerciseSetRows)"
```

---

## Task 5: i18n + Progress list screen + nav

**Files:**
- Modify: `src/i18n/strings/en.json`
- Create: `src/features/progress/ProgressPage.tsx`
- Modify: `src/App.tsx`, `src/components/AppHeader.tsx`, `src/features/profile/DashboardPage.tsx`

- [ ] **Step 1: Add i18n keys**

In `src/i18n/strings/en.json`, find the last key (currently `"history.weeksAgo": "weeks ago"`), add a comma to it, and insert after it (before the closing `}`):

```json
  "progress.title": "Progress",
  "progress.empty": "No exercises trained yet.",
  "progress.search": "Search exercises",
  "progress.notEnoughData": "Not enough data yet — log a couple more sessions.",
  "progress.metric.e1rm": "Est. 1RM",
  "progress.metric.volume": "Volume",
  "progress.range.all": "All time",
  "progress.range.meso": "This meso",
  "progress.latest": "Latest"
```

Verify with `node -e "require('./src/i18n/strings/en.json')"` (no error).

- [ ] **Step 2: Create `ProgressPage.tsx`**

```tsx
// src/features/progress/ProgressPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { listTrainedExercises, type TrainedExercise } from '../../data/progressRepo'
import { shortDate } from '../history/historyFormat'

export function ProgressPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [items, setItems] = useState<TrainedExercise[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    listTrainedExercises(userId).then(setItems).catch(() => { setError(true); setItems([]) })
  }, [userId])

  const filtered = useMemo(
    () => (items ?? []).filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase())),
    [items, query],
  )
  const control = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white'

  if (items === null) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-4xl space-y-4">
        {error ? (
          <p className="text-sm text-red-500">{t('common.error')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('progress.empty')}</p>
        ) : (
          <>
            <input className={control} placeholder={t('progress.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((i) => (
                <li key={i.exerciseId}>
                  <button onClick={() => navigate(`/progress/${i.exerciseId}`)} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-left dark:bg-[#1b2030]">
                    <div className="font-semibold">{i.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{t('progress.latest')}: {shortDate(i.lastTrained)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add route in `src/App.tsx`**

Add the import with the other feature imports:

```tsx
import { ProgressPage } from './features/progress/ProgressPage'
```

Inside the `RequireOnboarding`/`AppLayout` route group (next to `/history`), add:

```tsx
                  <Route path="/progress" element={<ProgressPage />} />
```

- [ ] **Step 4: Add header title in `src/components/AppHeader.tsx`**

In `titleKey`, before the final `return null`, add (exact match before the `startsWith` from Task 6):

```ts
  if (path === '/progress') return 'progress.title'
  if (path.startsWith('/progress/')) return 'progress.title'
```

- [ ] **Step 5: Add the Progress card in `src/features/profile/DashboardPage.tsx`**

Inside the `<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">`, after the History link, add:

```tsx
            <Link to="/progress" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('progress.title')}</Link>
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: clean build, no TS errors.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/strings/en.json src/features/progress/ProgressPage.tsx src/App.tsx src/components/AppHeader.tsx src/features/profile/DashboardPage.tsx
git commit -m "feat(progress): i18n, Progress list screen, route, dashboard card"
```

---

## Task 6: Exercise progress detail screen

**Files:**
- Create: `src/features/progress/ExerciseProgressPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `ExerciseProgressPage.tsx`**

```tsx
// src/features/progress/ExerciseProgressPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useUnits } from '../profile/useUnits'
import { getActiveMeso } from '../../data/mesoRepo'
import { getExercisesByIds } from '../../data/exerciseRepo'
import { getExerciseSetRows } from '../../data/progressRepo'
import { summarizeSessions, type ProgressionPoint } from '../../domain/progressMetrics'
import { LineChart } from '../../components/charts/LineChart'
import { shortDate } from '../history/historyFormat'

type Metric = 'e1rm' | 'volume'
type Range = 'all' | 'meso'

export function ExerciseProgressPage() {
  const t = useT()
  const u = useUnits()
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [name, setName] = useState('')
  const [activeMesoId, setActiveMesoId] = useState<string | null>(null)
  const [points, setPoints] = useState<ProgressionPoint[] | null>(null)
  const [metric, setMetric] = useState<Metric>('e1rm')
  const [range, setRange] = useState<Range>('all')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!exerciseId) return
    (async () => {
      const [byId, meso] = await Promise.all([getExercisesByIds([exerciseId]), getActiveMeso(userId)])
      setName(byId[exerciseId]?.name ?? '—')
      setActiveMesoId(meso?.id ?? null)
    })().catch(() => setError(true))
  }, [exerciseId, userId])

  useEffect(() => {
    if (!exerciseId) return
    setPoints(null)
    const mesoId = range === 'meso' ? activeMesoId ?? undefined : undefined
    getExerciseSetRows(userId, exerciseId, mesoId ? { mesoId } : undefined)
      .then((rows) => setPoints(summarizeSessions(rows)))
      .catch(() => setError(true))
  }, [exerciseId, userId, range, activeMesoId])

  const chartPoints = useMemo(
    () => (points ?? []).map((p) => ({ t: new Date(p.date).getTime(), v: u.toWeight(metric === 'e1rm' ? p.e1rm : p.volume) })),
    [points, metric, u],
  )
  const latest = chartPoints.length ? chartPoints[chartPoints.length - 1] : null
  const tab = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-[#1b2030]'}`

  if (error) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white"><p className="text-sm text-red-500">{t('common.error')}</p></div>
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-bold">{name}</h1>
        <div className="flex gap-2">
          <button className={tab(metric === 'e1rm')} onClick={() => setMetric('e1rm')}>{t('progress.metric.e1rm')}</button>
          <button className={tab(metric === 'volume')} onClick={() => setMetric('volume')}>{t('progress.metric.volume')}</button>
        </div>
        {activeMesoId && (
          <div className="flex gap-2">
            <button className={tab(range === 'all')} onClick={() => setRange('all')}>{t('progress.range.all')}</button>
            <button className={tab(range === 'meso')} onClick={() => setRange('meso')}>{t('progress.range.meso')}</button>
          </div>
        )}
        {points === null ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
        ) : chartPoints.length < 2 ? (
          <div className="space-y-2">
            {latest && <p className="text-sm">{t('progress.latest')}: {Math.round(latest.v)} {u.weightLabel}</p>}
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('progress.notEnoughData')}</p>
          </div>
        ) : (
          <>
            <LineChart
              points={chartPoints}
              formatValue={(v) => `${Math.round(v)} ${u.weightLabel}`}
              formatDate={(ms) => shortDate(new Date(ms).toISOString())}
              yLabel={metric === 'e1rm' ? t('progress.metric.e1rm') : t('progress.metric.volume')}
            />
            {latest && <p className="text-sm text-slate-500 dark:text-slate-400">{t('progress.latest')}: {Math.round(latest.v)} {u.weightLabel}</p>}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add route in `src/App.tsx`**

Add the import:

```tsx
import { ExerciseProgressPage } from './features/progress/ExerciseProgressPage'
```

Next to the `/progress` route added in Task 5, add:

```tsx
                  <Route path="/progress/:exerciseId" element={<ExerciseProgressPage />} />
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean build, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/progress/ExerciseProgressPage.tsx src/App.tsx
git commit -m "feat(progress): exercise detail with metric + range toggles and chart"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: `✓ built`, `dist/sw.js` generated, no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all pass (111 prior + 9 new = 120).

- [ ] **Step 3: Confirm clean tree**

Run: `git status --short`
Expected: empty.

---

## Out of scope (future)
- Bodyweight graph (#3) reuses `<LineChart>` + `chartScale` — separate spec.
- PR/per-set tables, multi-exercise comparison, trend/regression lines.
