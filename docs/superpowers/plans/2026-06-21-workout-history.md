# Workout History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user review past workouts of the running meso — a mid-workout "Previous workout" panel (paging same-day sessions) and a standalone History screen — sharing one read-only session-detail view.

**Architecture:** A presentational `SessionDetailView` renders one full session; thin containers fetch data and feed it. New repo reads (`listMesoSessions`, `getExercisesByIds`) sit at the Supabase boundary; existing `getSessionFull` is reused. Pure date/duration helpers are unit-tested; relative dates return structured tokens so all copy stays in the i18n JSON.

**Tech Stack:** Vite + React + TypeScript, Tailwind, Supabase (PostgREST), Vitest. Node 18 (`npm run build` = `tsc -b && node --experimental-global-webcrypto node_modules/vite/bin/vite.js build`).

---

## Conventions (read before starting)

- **Verification:** Pure helpers are TDD'd with Vitest. Repos (Supabase boundary) and React components are not unit-tested in this codebase — verify them with `npm run build` (type-checks via `tsc -b`) and a passing `npm test`. This matches the existing pattern.
- **Styling:** primary buttons `bg-brand-700 hover:bg-brand-800`; surfaces `bg-white dark:bg-[#0f1115]`; cards `bg-slate-100 dark:bg-[#1b2030]`.
- **Units:** display weights via `useUnits()` (`u.toWeight(kg)`, `u.weightLabel`).
- **i18n:** every user-facing string via `useT()` → `t('key')`; keys live in `src/i18n/strings/en.json`.

## File Structure

**Create:**
- `src/features/history/historyFormat.ts` — pure: `shortDate`, `relativeDate`, `formatDuration`.
- `src/features/history/historyFormat.test.ts` — unit tests.
- `src/features/history/SessionDetailView.tsx` — read-only one-session view (shared core).
- `src/features/history/HistoryPage.tsx` — `/history` list.
- `src/features/history/SessionHistoryDetailPage.tsx` — `/history/:sessionId` detail.
- `src/features/history/PreviousWorkoutPanel.tsx` — in-workout slide-over.

**Modify:**
- `src/data/sessionRepo.ts` — add `SessionSummary` + `listMesoSessions`.
- `src/data/exerciseRepo.ts` — add `getExercisesByIds`.
- `src/i18n/strings/en.json` — add history/workout keys.
- `src/App.tsx` — add two routes.
- `src/components/AppHeader.tsx` — title map entries.
- `src/features/profile/DashboardPage.tsx` — History nav card.
- `src/features/session/ActiveWorkoutPage.tsx` — Previous button + panel.

---

## Task 1: Pure date/duration helpers

**Files:**
- Create: `src/features/history/historyFormat.ts`
- Test: `src/features/history/historyFormat.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/history/historyFormat.test.ts
import { describe, it, expect } from 'vitest'
import { relativeDate, formatDuration } from './historyFormat'

describe('relativeDate', () => {
  const now = new Date('2026-06-21T12:00:00')
  it('today', () => { expect(relativeDate('2026-06-21T08:00:00', now)).toEqual({ kind: 'today' }) })
  it('yesterday', () => { expect(relativeDate('2026-06-20T08:00:00', now)).toEqual({ kind: 'yesterday' }) })
  it('days ago', () => { expect(relativeDate('2026-06-18T08:00:00', now)).toEqual({ kind: 'daysAgo', n: 3 }) })
  it('one week ago', () => { expect(relativeDate('2026-06-11T08:00:00', now)).toEqual({ kind: 'weeksAgo', n: 1 }) })
  it('weeks ago', () => { expect(relativeDate('2026-05-31T08:00:00', now)).toEqual({ kind: 'weeksAgo', n: 3 }) })
})

describe('formatDuration', () => {
  it('hours and minutes', () => { expect(formatDuration('2026-06-21T10:00:00', '2026-06-21T11:12:00')).toBe('1h 12m') })
  it('minutes only', () => { expect(formatDuration('2026-06-21T10:00:00', '2026-06-21T10:45:00')).toBe('45m') })
  it('null end', () => { expect(formatDuration('2026-06-21T10:00:00', null)).toBeNull() })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- historyFormat`
Expected: FAIL — `historyFormat.ts` / exports do not exist.

- [ ] **Step 3: Implement the helpers**

```ts
// src/features/history/historyFormat.ts

export type RelativeDate =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'daysAgo'; n: number }
  | { kind: 'weeksAgo'; n: number }

/** Concise calendar date, e.g. "16 Jun" (order is locale-dependent). */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Structured relative phrase vs `now`. Component maps kind -> i18n copy. */
export function relativeDate(iso: string, now: Date): RelativeDate {
  const dayNum = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((dayNum(now) - dayNum(new Date(iso))) / 86_400_000)
  if (days <= 0) return { kind: 'today' }
  if (days === 1) return { kind: 'yesterday' }
  if (days < 7) return { kind: 'daysAgo', n: days }
  return { kind: 'weeksAgo', n: Math.floor(days / 7) }
}

/** "1h 12m" / "45m" between start and end; null if no/invalid end. */
export function formatDuration(startIso: string, endIso: string | null): string | null {
  if (!endIso) return null
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (ms < 0) return null
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- historyFormat`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/history/historyFormat.ts src/features/history/historyFormat.test.ts
git commit -m "feat(history): pure date/duration helpers"
```

---

## Task 2: Data-layer reads

**Files:**
- Modify: `src/data/sessionRepo.ts`
- Modify: `src/data/exerciseRepo.ts`

- [ ] **Step 1: Add `SessionSummary` + `listMesoSessions` to `sessionRepo.ts`**

Append at the end of `src/data/sessionRepo.ts`:

```ts
export interface SessionSummary {
  id: string
  meso_day_id: string | null
  started_at: string
  ended_at: string | null
  is_deload: boolean
  exerciseCount: number
}

/** Completed sessions for a meso, newest first. Optional same-day filter. */
export async function listMesoSessions(
  userId: string,
  mesoId: string,
  opts?: { mesoDayId?: string },
): Promise<SessionSummary[]> {
  let q = supabase
    .from('workout_session')
    .select('id, meso_day_id, started_at, ended_at, is_deload, session_exercise(count)')
    .eq('user_id', userId)
    .eq('meso_id', mesoId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
  if (opts?.mesoDayId) q = q.eq('meso_day_id', opts.mesoDayId)
  const { data, error } = await q
  if (error) throw error
  type Raw = { id: string; meso_day_id: string | null; started_at: string; ended_at: string | null; is_deload: boolean; session_exercise: { count: number }[] }
  return ((data ?? []) as Raw[]).map((r) => ({
    id: r.id,
    meso_day_id: r.meso_day_id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    is_deload: r.is_deload,
    exerciseCount: r.session_exercise?.[0]?.count ?? 0,
  }))
}
```

- [ ] **Step 2: Add `getExercisesByIds` to `exerciseRepo.ts`**

Append at the end of `src/data/exerciseRepo.ts`:

```ts
/** Exercises keyed by id (planned, custom, swapped, or added), for name display. */
export async function getExercisesByIds(ids: string[]): Promise<Record<string, ExerciseRow>> {
  if (!ids.length) return {}
  const { data, error } = await supabase.from('exercise').select('*').in('id', ids)
  if (error) throw error
  return Object.fromEntries(((data ?? []) as ExerciseRow[]).map((e) => [e.id, e]))
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: builds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/data/sessionRepo.ts src/data/exerciseRepo.ts
git commit -m "feat(history): listMesoSessions + getExercisesByIds repo reads"
```

---

## Task 3: i18n keys + `SessionDetailView`

**Files:**
- Modify: `src/i18n/strings/en.json`
- Create: `src/features/history/SessionDetailView.tsx`

- [ ] **Step 1: Add the i18n keys**

In `src/i18n/strings/en.json`, add these entries immediately after the line
`"install.unavailable": "...",` (add a comma to that line if it is the last key
before `}`):

```json
  "workout.previous": "Previous workout",
  "history.title": "History",
  "history.sessionTitle": "Workout",
  "history.previousTitle": "Previous workout",
  "history.empty": "No workouts logged in this meso yet.",
  "history.noActiveMeso": "No active mesocycle.",
  "history.noPreviousDay": "No previous workout for this day yet.",
  "history.older": "Older",
  "history.newer": "Newer",
  "history.deload": "Deload",
  "history.exercises": "exercises",
  "history.noSets": "No sets logged.",
  "history.today": "today",
  "history.yesterday": "yesterday",
  "history.daysAgo": "days ago",
  "history.weekAgo": "week ago",
  "history.weeksAgo": "weeks ago"
```

- [ ] **Step 2: Create `SessionDetailView.tsx`**

```tsx
// src/features/history/SessionDetailView.tsx
import { useT } from '../../i18n/I18nProvider'
import { useUnits } from '../profile/useUnits'
import { shortDate, formatDuration } from './historyFormat'
import type { SessionFull } from '../../data/sessionRepo'
import type { ExerciseRow } from '../../data/rows'

/** Read-only render of one full session. Pure presentational — no fetching. */
export function SessionDetailView({ full, exercisesById }: {
  full: SessionFull
  exercisesById: Record<string, ExerciseRow>
}) {
  const t = useT()
  const u = useUnits()
  const { session, exercises } = full
  const duration = formatDuration(session.started_at, session.ended_at)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span>{shortDate(session.started_at)}</span>
        {duration && <span>· {duration}</span>}
        {session.is_deload && (
          <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{t('history.deload')}</span>
        )}
      </div>
      {exercises.map((se) => {
        const ex = exercisesById[se.exercise_id]
        return (
          <div key={se.id}>
            <div className="font-semibold">{ex?.name ?? '—'}</div>
            {se.sets.length === 0 ? (
              <div className="text-sm text-slate-400">{t('history.noSets')}</div>
            ) : (
              <ul className="mt-1 space-y-0.5 text-sm">
                {se.sets.map((s, i) => {
                  const seg = s.segments[0]
                  if (!seg) return null
                  return (
                    <li key={s.id} className="flex gap-3 tabular-nums">
                      <span className="w-4 text-slate-400">{i + 1}</span>
                      <span>{u.toWeight(seg.weight)} {u.weightLabel} × {seg.reps}</span>
                      {seg.rir != null && <span className="text-slate-400">{t('workout.rir')} {seg.rir}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: builds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/strings/en.json src/features/history/SessionDetailView.tsx
git commit -m "feat(history): i18n keys + read-only SessionDetailView"
```

---

## Task 4: History screen + detail route + nav

**Files:**
- Create: `src/features/history/HistoryPage.tsx`
- Create: `src/features/history/SessionHistoryDetailPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AppHeader.tsx`
- Modify: `src/features/profile/DashboardPage.tsx`

- [ ] **Step 1: Create `HistoryPage.tsx`**

```tsx
// src/features/history/HistoryPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { getActiveMeso, getMesoFull } from '../../data/mesoRepo'
import { listMesoSessions, type SessionSummary } from '../../data/sessionRepo'
import { shortDate } from './historyFormat'

export function HistoryPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [dayLabels, setDayLabels] = useState<Record<string, string>>({})
  const [hasMeso, setHasMeso] = useState(true)

  useEffect(() => {
    (async () => {
      const meso = await getActiveMeso(userId)
      if (!meso) { setHasMeso(false); setSessions([]); return }
      const [full, list] = await Promise.all([getMesoFull(meso.id), listMesoSessions(userId, meso.id)])
      setDayLabels(Object.fromEntries(full.days.map((d) => [d.id, d.label])))
      setSessions(list)
    })().catch(() => setSessions([]))
  }, [userId])

  if (sessions === null) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-md space-y-2">
        {!hasMeso ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.noActiveMeso')}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.empty')}</p>
        ) : (
          sessions.map((s) => (
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
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `SessionHistoryDetailPage.tsx`**

```tsx
// src/features/history/SessionHistoryDetailPage.tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useT } from '../../i18n/I18nProvider'
import { getSessionFull, type SessionFull } from '../../data/sessionRepo'
import { getExercisesByIds } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import { SessionDetailView } from './SessionDetailView'

export function SessionHistoryDetailPage() {
  const t = useT()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [full, setFull] = useState<SessionFull | null>(null)
  const [exById, setExById] = useState<Record<string, ExerciseRow>>({})
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    (async () => {
      const f = await getSessionFull(sessionId)
      const ex = await getExercisesByIds(f.exercises.map((e) => e.exercise_id))
      setFull(f); setExById(ex)
    })().catch(() => setError(true))
  }, [sessionId])

  if (error) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white"><p className="text-sm text-red-500">{t('common.error')}</p></div>
  }
  if (!full) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-md"><SessionDetailView full={full} exercisesById={exById} /></div>
    </div>
  )
}
```

- [ ] **Step 3: Register routes in `src/App.tsx`**

Add imports near the other feature imports:

```tsx
import { HistoryPage } from './features/history/HistoryPage'
import { SessionHistoryDetailPage } from './features/history/SessionHistoryDetailPage'
```

Inside the `<RequireOnboarding><AppLayout /></RequireOnboarding>` route group (the
block that already contains `/goals` and `/goals/edit`), add:

```tsx
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/history/:sessionId" element={<SessionHistoryDetailPage />} />
```

- [ ] **Step 4: Add header titles in `src/components/AppHeader.tsx`**

In `titleKey`, add these two lines before the final `return null` (the exact
`/history` check MUST come before the `startsWith('/history/')` check):

```ts
  if (path === '/history') return 'history.title'
  if (path.startsWith('/history/')) return 'history.sessionTitle'
```

- [ ] **Step 5: Add the History card in `src/features/profile/DashboardPage.tsx`**

Directly after the Exercises `<Link>` line
(`<Link to="/exercises" ...>{t('exercises.title')}</Link>`), add:

```tsx
          <Link to="/history" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('history.title')}</Link>
```

- [ ] **Step 6: Type-check**

Run: `npm run build`
Expected: builds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/history/HistoryPage.tsx src/features/history/SessionHistoryDetailPage.tsx src/App.tsx src/components/AppHeader.tsx src/features/profile/DashboardPage.tsx
git commit -m "feat(history): History screen, detail route, dashboard nav"
```

---

## Task 5: In-workout Previous-workout panel

**Files:**
- Create: `src/features/history/PreviousWorkoutPanel.tsx`
- Modify: `src/features/session/ActiveWorkoutPage.tsx`

- [ ] **Step 1: Create `PreviousWorkoutPanel.tsx`**

```tsx
// src/features/history/PreviousWorkoutPanel.tsx
import { useEffect, useState } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { listMesoSessions, getSessionFull, type SessionSummary, type SessionFull } from '../../data/sessionRepo'
import { getExercisesByIds } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import { SessionDetailView } from './SessionDetailView'
import { shortDate, relativeDate, type RelativeDate } from './historyFormat'

function renderRelative(r: RelativeDate, t: (k: string) => string): string {
  switch (r.kind) {
    case 'today': return t('history.today')
    case 'yesterday': return t('history.yesterday')
    case 'daysAgo': return `${r.n} ${t('history.daysAgo')}`
    case 'weeksAgo': return `${r.n} ${r.n === 1 ? t('history.weekAgo') : t('history.weeksAgo')}`
  }
}

export function PreviousWorkoutPanel({ userId, mesoId, mesoDayId, dayLabel, onClose }: {
  userId: string
  mesoId: string
  mesoDayId: string
  dayLabel: string
  onClose: () => void
}) {
  const t = useT()
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [index, setIndex] = useState(0)
  const [full, setFull] = useState<SessionFull | null>(null)
  const [exById, setExById] = useState<Record<string, ExerciseRow>>({})

  useEffect(() => {
    listMesoSessions(userId, mesoId, { mesoDayId }).then(setSessions).catch(() => setSessions([]))
  }, [userId, mesoId, mesoDayId])

  useEffect(() => {
    if (!sessions || !sessions.length) { setFull(null); return }
    const s = sessions[index]
    setFull(null)
    getSessionFull(s.id).then(async (f) => {
      const ex = await getExercisesByIds(f.exercises.map((e) => e.exercise_id))
      setFull(f); setExById(ex)
    }).catch(() => setFull(null))
  }, [sessions, index])

  const current = sessions?.[index]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div className="mt-auto max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('history.previousTitle')}</h2>
          <button onClick={onClose} className="text-sm text-slate-500 dark:text-slate-400">{t('exercises.cancel')}</button>
        </div>
        {sessions === null ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.noPreviousDay')}</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <button disabled={index >= sessions.length - 1} onClick={() => setIndex((i) => i + 1)} className="text-sm font-semibold text-brand-700 disabled:opacity-30 dark:text-brand-400">← {t('history.older')}</button>
              <div className="text-center text-xs text-slate-500 dark:text-slate-400">
                <div>{dayLabel} · {current && shortDate(current.started_at)}</div>
                <div>{current && renderRelative(relativeDate(current.started_at, new Date()), t)}</div>
              </div>
              <button disabled={index <= 0} onClick={() => setIndex((i) => i - 1)} className="text-sm font-semibold text-brand-700 disabled:opacity-30 dark:text-brand-400">{t('history.newer')} →</button>
            </div>
            {full ? <SessionDetailView full={full} exercisesById={exById} /> : <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire the panel into `ActiveWorkoutPage.tsx`**

Add the import near the other feature imports:

```tsx
import { PreviousWorkoutPanel } from '../history/PreviousWorkoutPanel'
```

Add panel state alongside the other `useState` hooks (near `pickerOpen`):

```tsx
  const [historyOpen, setHistoryOpen] = useState(false)
```

In the active-session render (the `return` after the start-chooser block, where
`full` is non-null), compute the day label right before the `return`:

```tsx
  const dayLabel = mesoFull?.days.find((d) => d.id === full.session.meso_day_id)?.label ?? ''
```

Inside the body `<div className="mx-auto max-w-md space-y-3 p-6">`, directly after
the deload-banner block and before `{full.exercises.map(...)}`, add the trigger:

```tsx
        {full.session.meso_id && full.session.meso_day_id && (
          <button onClick={() => setHistoryOpen(true)} className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-brand-700 dark:bg-[#1b2030] dark:text-brand-400">
            {t('workout.previous')}
          </button>
        )}
```

At the end of the active-session JSX, next to
`{pickerOpen && <ExercisePickerSheet ... />}`, add the panel:

```tsx
      {historyOpen && full.session.meso_id && full.session.meso_day_id && (
        <PreviousWorkoutPanel
          userId={userId}
          mesoId={full.session.meso_id}
          mesoDayId={full.session.meso_day_id}
          dayLabel={dayLabel}
          onClose={() => setHistoryOpen(false)}
        />
      )}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: builds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/history/PreviousWorkoutPanel.tsx src/features/session/ActiveWorkoutPage.tsx
git commit -m "feat(history): in-workout Previous-workout panel with same-day paging"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: `✓ built`, `dist/sw.js` generated, no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass (previous 103 + 8 new = 111).

- [ ] **Step 3: Confirm clean tree**

Run: `git status --short`
Expected: empty (all work committed across Tasks 1–5).

---

## Out of scope (future specs)
- Exercise progression (#2) and bodyweight trend graph (#3) — both need a charting decision.
- Editing past sessions; history across non-active mesos.
