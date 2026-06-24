# Bodyweight Trend Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Weight trend" line chart to the User Metrics screen (`/goals`), reusing the existing `<LineChart>` and `listWeights`, refreshing after a weigh-in is logged.

**Architecture:** Pure wiring — no new repo or domain logic. `GoalsPage` fetches `weightRepo.listWeights`, maps each weigh-in to a chart point, and renders `<LineChart>`. Branch `feat/workout-history`.

**Tech Stack:** Vite + React + TypeScript + Tailwind, Supabase, Vitest. Build: `npm run build`.

---

## Conventions
- All copy via `useT()`; keys in `src/i18n/strings/en.json`.
- Weights stored kg, displayed via `useUnits()` (`u.toWeight`, `u.weightLabel`).
- Components verified via `npm run build` (no new unit tests — `<LineChart>`/`chartScale` are already tested; this is wiring).
- Reuse: `listWeights` (`src/data/weightRepo.ts`), `WeightLogRow` (`src/data/rows.ts`), `LineChart` (`src/components/charts/LineChart.tsx`), `shortDate` (`src/features/history/historyFormat.ts`).

## File Structure
- **Modify** `src/i18n/strings/en.json` — two `metrics.*` keys.
- **Modify** `src/features/profile/GoalsPage.tsx` — fetch weights, render the trend chart, refresh after logging.

---

## Task 1: Bodyweight trend chart on User Metrics

**Files:**
- Modify: `src/i18n/strings/en.json`
- Modify: `src/features/profile/GoalsPage.tsx`

- [ ] **Step 1: Add i18n keys**

In `src/i18n/strings/en.json`, the last key is currently `"progress.latest": "Latest"`. Add a comma to it, then insert after it (before the closing `}`):

```json
  "metrics.weightTrend": "Weight trend",
  "metrics.notEnoughWeights": "Log a couple more weigh-ins to see a trend."
```

Verify JSON validity: `node -e "require('./src/i18n/strings/en.json')"` (no error).

- [ ] **Step 2: Rewrite `src/features/profile/GoalsPage.tsx`**

Replace the ENTIRE file with the following. (The `GoalsPage` function gains the weights fetch + chart; the `LogWeightModal` function below it is unchanged from the original — included here so the file is complete.)

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from './useProfileData'
import { useUnits } from './useUnits'
import { buildEnergySummary } from './energySummary'
import { addWeight, listWeights } from '../../data/weightRepo'
import type { WeightLogRow } from '../../data/rows'
import { LineChart } from '../../components/charts/LineChart'
import { shortDate } from '../history/historyFormat'
import { todayIso } from './today'

export function GoalsPage() {
  const t = useT()
  const { session } = useAuth()
  const { profile, latestWeight, latestGoal, reload } = useProfileData()
  const u = useUnits()
  const [modalOpen, setModalOpen] = useState(false)
  const userId = session?.user.id ?? ''
  const [weights, setWeights] = useState<WeightLogRow[] | null>(null)
  const loadWeights = useCallback(() => {
    if (!userId) return
    listWeights(userId).then(setWeights).catch(() => setWeights([]))
  }, [userId])
  useEffect(() => { loadWeights() }, [loadWeights])

  if (!session || !profile || !latestWeight || !latestGoal || !profile.sex || !profile.date_of_birth || profile.height_cm == null) return null

  const summary = buildEnergySummary({
    sex: profile.sex,
    dob: new Date(profile.date_of_birth + 'T12:00:00'),
    heightCm: profile.height_cm,
    weightKg: latestWeight.weight_kg,
    activityFactor: profile.baseline_activity_level,
    goal: latestGoal.goal,
    today: new Date(),
  })

  const weightPoints = (weights ?? []).map((w) => ({
    t: new Date(w.logged_on + 'T12:00:00').getTime(),
    v: u.toWeight(w.weight_kg),
  }))

  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between border-b border-slate-200 py-2.5 last:border-0 dark:border-slate-700/60">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  )

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setModalOpen(true)} className="rounded-lg bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-800">{t('metrics.logWeight')}</button>
          <Link to="/goals/edit" className="rounded-lg bg-slate-100 px-4 py-3 text-center text-sm font-semibold dark:bg-[#1b2030]">{t('metrics.resetGoal')}</Link>
        </div>

        <div className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
          {row(t('onboarding.sex'), t(`onboarding.${profile.sex}`))}
          {row(t('onboarding.height'), `${u.toHeight(profile.height_cm)} ${u.heightLabel}`)}
          {row(t('metrics.weight'), u.fmtWeight(latestWeight.weight_kg))}
          {row(t('dashboard.bmr'), `${summary.bmr} ${t('dashboard.kcal')}`)}
          {row(t('dashboard.maintenance'), `${Math.round(summary.tdee)} ${t('dashboard.kcal')}`)}
          {row(t('dashboard.target'), `${summary.target} ${t('dashboard.kcal')}`)}
          {row(t('onboarding.goal'), t(`goal.${latestGoal.goal}`))}
        </div>

        {weights !== null && weightPoints.length >= 1 && (
          <div className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
            <h2 className="mb-2 text-sm font-semibold">{t('metrics.weightTrend')}</h2>
            <LineChart
              points={weightPoints}
              formatValue={(v) => `${v.toFixed(1)} ${u.weightLabel}`}
              formatDate={(ms) => shortDate(new Date(ms).toISOString())}
              yLabel={u.weightLabel}
            />
            {weightPoints.length < 2 && (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('metrics.notEnoughWeights')}</p>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <LogWeightModal userId={session.user.id} onClose={() => setModalOpen(false)} onSaved={async () => { await reload(); loadWeights(); setModalOpen(false) }} />
      )}
    </div>
  )
}

function LogWeightModal({ userId, onClose, onSaved }: { userId: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const t = useT()
  const u = useUnits()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!value) return
    setBusy(true); setError(null)
    try {
      await addWeight(userId, todayIso(), u.fromWeight(Number(value)))
      await onSaved()
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Metrics] logWeight failed:', err)
      setError(t('common.error'))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="w-full max-w-xs space-y-4 rounded-2xl bg-white p-5 text-slate-900 dark:bg-[#1b2030] dark:text-white" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{t('metrics.logWeight')}</h2>
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder={u.weightLabel}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#0f1115] dark:text-white"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold dark:bg-[#0f1115]">{t('exercises.cancel')}</button>
          <button onClick={save} disabled={busy} className="flex-1 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean build, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/strings/en.json src/features/profile/GoalsPage.tsx
git commit -m "feat(metrics): bodyweight trend chart on User Metrics screen"
```

---

## Task 2: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: `✓ built`, `dist/sw.js` generated, no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all pass (120 — unchanged; this task adds no tests).

- [ ] **Step 3: Confirm clean tree**

Run: `git status --short`
Expected: empty.

---

## Notes
- Hooks (`useState` weights, `useCallback`, `useEffect`) are placed BEFORE the early `return null` guard — required by the Rules of Hooks.
- `yLabel={u.weightLabel}` gives the chart its accessible name + idle caption (the unit), without duplicating the visible "Weight trend" heading.
- One weigh-in renders a single dot plus the "not enough for a trend" note; mobile/desktop layout is inherited from the existing `max-w-lg` User Metrics container.
