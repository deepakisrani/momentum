# Momentum Phase 2 — Domain Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, fully unit-tested TypeScript domain layer — energy math, the next-workout suggestion engine, and scheduling/microcycle logic — with zero I/O and zero Supabase imports, so it can power the UI now and lift into a custom backend later.

**Architecture:** A `src/domain/` package of pure functions and shared types. No React, no Supabase, no `Date.now()`/`Math.random()` inside the functions (callers pass `now`/inputs). Each module has one responsibility and is exhaustively tested with Vitest. The UI (Plan 3+) imports these and maps structured results to i18n copy — the domain never imports i18n.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

---

## File Structure

```
src/domain/
  types.ts            # shared domain types (Sex, Goal, Mechanic, RepRange, SetResult, SchedulingStyle)
  units.ts            # kg/lb, cm/in conversions
  units.test.ts
  energy.ts           # Mifflin–St Jeor BMR, TDEE, goal-adjusted calorie target, age
  energy.test.ts
  suggestion.ts       # next-set-one suggestion (double progression, goal-gated RIR, mechanic increments, deload)
  suggestion.test.ts
  scheduling.ts       # deload cadence + debt, calendar-week slate, week rollover, continuous rotation
  scheduling.test.ts
  index.ts            # barrel re-exporting the public API
```

All values are stored/computed in **metric** (kg, cm); conversion happens only at UI edges via `units.ts`.

---

## Task 1: Shared types + unit conversions

**Files:**
- Create: `src/domain/types.ts`, `src/domain/units.ts`, `src/domain/units.test.ts`

- [ ] **Step 1: Create `src/domain/types.ts`**

```ts
export type Sex = 'male' | 'female'
export type Goal = 'cut' | 'bulk' | 'maintain'
export type Mechanic = 'compound' | 'isolation'
export type Units = 'metric' | 'imperial'
export type SchedulingStyle = 'calendar_week' | 'continuous'

export interface RepRange {
  min: number
  max: number
}

/** One logged set's working result (for a drop-set, this is its top segment). */
export interface SetResult {
  weight: number
  reps: number
  rir: number | null
}
```

- [ ] **Step 2: Write the failing test `src/domain/units.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { kgToLb, lbToKg, cmToIn, inToCm } from './units'

describe('units', () => {
  it('converts kg to lb and back', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 2)
    expect(lbToKg(220.462)).toBeCloseTo(100, 3)
  })
  it('converts cm to inches and back', () => {
    expect(cmToIn(180)).toBeCloseTo(70.866, 2)
    expect(inToCm(70.866)).toBeCloseTo(180, 2)
  })
  it('round-trips without drift', () => {
    expect(lbToKg(kgToLb(82.5))).toBeCloseTo(82.5, 6)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- units`
Expected: FAIL — cannot find module `./units`.

- [ ] **Step 4: Implement `src/domain/units.ts`**

```ts
const KG_PER_LB = 0.45359237
const CM_PER_IN = 2.54

export const kgToLb = (kg: number): number => kg / KG_PER_LB
export const lbToKg = (lb: number): number => lb * KG_PER_LB
export const cmToIn = (cm: number): number => cm / CM_PER_IN
export const inToCm = (inch: number): number => inch * CM_PER_IN
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- units`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/units.ts src/domain/units.test.ts
git commit -m "feat(domain): shared types and unit conversions"
```

---

## Task 2: Energy math (BMR / TDEE / calorie target)

**Files:**
- Create: `src/domain/energy.ts`, `src/domain/energy.test.ts`

- [ ] **Step 1: Write the failing test `src/domain/energy.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { ageFromDate, mifflinStJeorBmr, tdee, calorieTarget, GOAL_CALORIE_ADJUSTMENT } from './energy'

describe('energy', () => {
  it('computes whole-year age, accounting for month/day', () => {
    expect(ageFromDate(new Date(1991, 0, 15), new Date(2026, 5, 20))).toBe(35)
    expect(ageFromDate(new Date(1991, 11, 31), new Date(2026, 5, 20))).toBe(34) // birthday not yet reached
  })

  it('computes Mifflin–St Jeor BMR for male and female', () => {
    // male: 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(mifflinStJeorBmr({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 })).toBe(1780)
    // female: 10*65 + 6.25*165 - 5*30 - 161 = 1370.25
    expect(mifflinStJeorBmr({ sex: 'female', weightKg: 65, heightCm: 165, ageYears: 30 })).toBeCloseTo(1370.25, 2)
  })

  it('computes TDEE from BMR and activity factor', () => {
    expect(tdee(1780, 1.2)).toBeCloseTo(2136, 5)
  })

  it('applies goal adjustment to the calorie target (rounded)', () => {
    expect(GOAL_CALORIE_ADJUSTMENT).toEqual({ cut: -0.2, bulk: 0.12, maintain: 0 })
    expect(calorieTarget(2136, 'maintain')).toBe(2136)
    expect(calorieTarget(2136, 'cut')).toBe(1709) // round(2136*0.8)=1708.8→1709
    expect(calorieTarget(2136, 'bulk')).toBe(2392) // round(2136*1.12)=2392.32→2392
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- energy`
Expected: FAIL — cannot find module `./energy`.

- [ ] **Step 3: Implement `src/domain/energy.ts`**

```ts
import type { Sex, Goal } from './types'

export interface BmrInput {
  sex: Sex
  weightKg: number
  heightCm: number
  ageYears: number
}

/** Whole years between dob and `on`, decrementing if the birthday hasn't occurred yet. */
export function ageFromDate(dob: Date, on: Date): number {
  let age = on.getFullYear() - dob.getFullYear()
  const monthDelta = on.getMonth() - dob.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && on.getDate() < dob.getDate())) age--
  return age
}

export function mifflinStJeorBmr({ sex, weightKg, heightCm, ageYears }: BmrInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears
  return sex === 'male' ? base + 5 : base - 161
}

export function tdee(bmr: number, activityFactor: number): number {
  return bmr * activityFactor
}

export const GOAL_CALORIE_ADJUSTMENT: Record<Goal, number> = {
  cut: -0.2,
  bulk: 0.12,
  maintain: 0,
}

export function calorieTarget(tdeeValue: number, goal: Goal): number {
  return Math.round(tdeeValue * (1 + GOAL_CALORIE_ADJUSTMENT[goal]))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- energy`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/energy.ts src/domain/energy.test.ts
git commit -m "feat(domain): Mifflin-St Jeor energy math"
```

---

## Task 3: Suggestion engine

Rules (locked with the user):
- **Double progression:** progress reps within the range first; once the top set hits `repRange.max`, add one weight increment and reset the rep target to `repRange.min`.
- **Goal-gated RIR** to allow a weight increase: **bulk ≥ 1, maintain ≥ 2, cut ≥ 3** reps in reserve on the top set.
- **Mechanic increment:** compound `+2.5`, isolation `+1.25`, unknown `+2.5`; overridable via `increment`.
- **Deload:** suggest ~10% lighter (rounded to 0.5), rep target at `repRange.min`.
- **No history** (`null`/empty) → return `null` (UI shows empty inputs).
- **RIR not logged** on a top-of-range set → hold weight (can't apply the gate), don't guess up.
- The engine returns a structured `reason` code; the UI maps it to i18n copy (domain stays i18n-free).

**Files:**
- Create: `src/domain/suggestion.ts`, `src/domain/suggestion.test.ts`

- [ ] **Step 1: Write the failing test `src/domain/suggestion.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { suggestNextSetOne } from './suggestion'
import type { SetResult } from './types'

const base = { repRange: { min: 8, max: 12 }, goal: 'maintain' as const, mechanic: 'compound' as const, isDeload: false }
const sets = (...s: SetResult[]) => s

describe('suggestNextSetOne', () => {
  it('returns null when there is no history', () => {
    expect(suggestNextSetOne({ ...base, lastSession: null })).toBeNull()
    expect(suggestNextSetOne({ ...base, lastSession: [] })).toBeNull()
  })

  it('adds weight when top set hit the range top with enough RIR (compound +2.5, reset to min)', () => {
    const r = suggestNextSetOne({ ...base, lastSession: sets({ weight: 60, reps: 12, rir: 2 }) })
    expect(r).toEqual({ weight: 62.5, repTarget: 8, reason: 'add_weight' })
  })

  it('uses isolation increment (+1.25)', () => {
    const r = suggestNextSetOne({ ...base, mechanic: 'isolation', lastSession: sets({ weight: 10, reps: 12, rir: 2 }) })
    expect(r).toEqual({ weight: 11.25, repTarget: 8, reason: 'add_weight' })
  })

  it('honors goal-gated RIR: cut needs RIR>=3, so RIR 2 holds at the top', () => {
    const r = suggestNextSetOne({ ...base, goal: 'cut', lastSession: sets({ weight: 60, reps: 12, rir: 2 }) })
    expect(r).toEqual({ weight: 60, repTarget: 12, reason: 'hold_no_reserve' })
  })

  it('bulk progresses with just RIR 1 at the top', () => {
    const r = suggestNextSetOne({ ...base, goal: 'bulk', lastSession: sets({ weight: 60, reps: 12, rir: 1 }) })
    expect(r).toEqual({ weight: 62.5, repTarget: 8, reason: 'add_weight' })
  })

  it('holds weight at top-of-range when RIR is not logged', () => {
    const r = suggestNextSetOne({ ...base, lastSession: sets({ weight: 60, reps: 12, rir: null }) })
    expect(r).toEqual({ weight: 60, repTarget: 12, reason: 'hold_missing_rir' })
  })

  it('adds a rep (toward max) when inside the range', () => {
    const r = suggestNextSetOne({ ...base, lastSession: sets({ weight: 60, reps: 9, rir: 2 }) })
    expect(r).toEqual({ weight: 60, repTarget: 10, reason: 'add_rep' })
  })

  it('rebuilds to the bottom of the range when below min', () => {
    const r = suggestNextSetOne({ ...base, lastSession: sets({ weight: 60, reps: 6, rir: 0 }) })
    expect(r).toEqual({ weight: 60, repTarget: 8, reason: 'rebuild' })
  })

  it('deload: ~10% lighter (rounded to 0.5) at the bottom of the range', () => {
    const r = suggestNextSetOne({ ...base, isDeload: true, lastSession: sets({ weight: 62.5, reps: 12, rir: 2 }) })
    expect(r).toEqual({ weight: 56.5, repTarget: 8, reason: 'deload' }) // 62.5*0.9=56.25→round 0.5→56.5
  })

  it('uses the heaviest set as the top set', () => {
    const r = suggestNextSetOne({ ...base, goal: 'bulk', lastSession: sets(
      { weight: 50, reps: 12, rir: 3 },
      { weight: 60, reps: 12, rir: 1 },
    ) })
    expect(r).toEqual({ weight: 62.5, repTarget: 8, reason: 'add_weight' })
  })

  it('respects an explicit increment override', () => {
    const r = suggestNextSetOne({ ...base, increment: 5, lastSession: sets({ weight: 60, reps: 12, rir: 2 }) })
    expect(r).toEqual({ weight: 65, repTarget: 8, reason: 'add_weight' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- suggestion`
Expected: FAIL — cannot find module `./suggestion`.

- [ ] **Step 3: Implement `src/domain/suggestion.ts`**

```ts
import type { Goal, Mechanic, RepRange, SetResult } from './types'

export type SuggestionReason =
  | 'deload'
  | 'add_weight'
  | 'add_rep'
  | 'hold_no_reserve'
  | 'hold_missing_rir'
  | 'rebuild'

export interface Suggestion {
  weight: number
  repTarget: number
  reason: SuggestionReason
}

export interface SuggestionInput {
  lastSession: SetResult[] | null
  repRange: RepRange
  goal: Goal
  mechanic: Mechanic | null
  isDeload: boolean
  /** Overrides the mechanic-derived default increment. */
  increment?: number
}

const RIR_GATE: Record<Goal, number> = { bulk: 1, maintain: 2, cut: 3 }

function defaultIncrement(mechanic: Mechanic | null): number {
  return mechanic === 'isolation' ? 1.25 : 2.5
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function topSet(sets: SetResult[]): SetResult {
  return sets.reduce((best, s) =>
    s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best,
  )
}

export function suggestNextSetOne(input: SuggestionInput): Suggestion | null {
  const { lastSession, repRange, goal, mechanic, isDeload } = input
  if (!lastSession || lastSession.length === 0) return null

  const increment = input.increment ?? defaultIncrement(mechanic)
  const top = topSet(lastSession)

  if (isDeload) {
    return { weight: roundTo(top.weight * 0.9, 0.5), repTarget: repRange.min, reason: 'deload' }
  }

  const hitTop = top.reps >= repRange.max

  if (hitTop) {
    if (top.rir == null) {
      return { weight: top.weight, repTarget: repRange.max, reason: 'hold_missing_rir' }
    }
    if (top.rir >= RIR_GATE[goal]) {
      return { weight: top.weight + increment, repTarget: repRange.min, reason: 'add_weight' }
    }
    return { weight: top.weight, repTarget: repRange.max, reason: 'hold_no_reserve' }
  }

  if (top.reps < repRange.min) {
    return { weight: top.weight, repTarget: repRange.min, reason: 'rebuild' }
  }

  return { weight: top.weight, repTarget: Math.min(top.reps + 1, repRange.max), reason: 'add_rep' }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- suggestion`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/domain/suggestion.ts src/domain/suggestion.test.ts
git commit -m "feat(domain): next-workout suggestion engine"
```

---

## Task 4: Scheduling / microcycle

Rules (locked with the user):
- A **microcycle** = one pass through the meso's day-types (≈ a calendar week for calendar-week scheduling, one completed rotation for continuous).
- **Deload every N microcycles** (`microcycleNumber % N === 0`); `deloadEveryN` null/≤0 = never.
- **Deload debt:** a due deload that wasn't actually performed carries forward, forcing the next microcycle to deload.
- **Calendar-week:** the slate is the day-types not yet completed this week; on week rollover the slate is full again. Week boundary respects a configurable `weekStartsOn` (0=Sun..6=Sat).
- **Continuous:** the next session is the next day-type in order, advancing by completed count (nothing expires).
- All functions are pure; callers pass `now` and current counts/state.

**Files:**
- Create: `src/domain/scheduling.ts`, `src/domain/scheduling.test.ts`

- [ ] **Step 1: Write the failing test `src/domain/scheduling.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  isScheduledDeload,
  shouldDeload,
  nextDeloadDebt,
  remainingSlate,
  startOfWeek,
  hasWeekRolledOver,
  nextInRotation,
} from './scheduling'

describe('deload cadence + debt', () => {
  it('flags every Nth microcycle as a scheduled deload', () => {
    expect(isScheduledDeload(5, 5)).toBe(true)
    expect(isScheduledDeload(10, 5)).toBe(true)
    expect(isScheduledDeload(4, 5)).toBe(false)
    expect(isScheduledDeload(3, null)).toBe(false)
    expect(isScheduledDeload(3, 0)).toBe(false)
  })
  it('deloads when scheduled OR debt is carried', () => {
    expect(shouldDeload(4, 5, false)).toBe(false)
    expect(shouldDeload(4, 5, true)).toBe(true) // owed from a skipped deload
    expect(shouldDeload(5, 5, false)).toBe(true)
  })
  it('owes a deload only when one was due but not performed', () => {
    expect(nextDeloadDebt(true, false)).toBe(true)
    expect(nextDeloadDebt(true, true)).toBe(false)
    expect(nextDeloadDebt(false, false)).toBe(false)
  })
})

describe('calendar-week slate', () => {
  it('returns day-types not yet completed this week, preserving order', () => {
    expect(remainingSlate(['push', 'pull', 'legs', 'arms'], ['pull', 'arms'])).toEqual(['push', 'legs'])
    expect(remainingSlate(['push', 'pull'], [])).toEqual(['push', 'pull'])
    expect(remainingSlate(['push', 'pull'], ['push', 'pull'])).toEqual([])
  })
  it('computes start of week for a given week-start day', () => {
    // 2026-06-20 is a Saturday. Week starting Monday(1) -> 2026-06-15.
    expect(startOfWeek(new Date(2026, 5, 20), 1)).toEqual(new Date(2026, 5, 15))
    // Week starting Sunday(0) -> 2026-06-14.
    expect(startOfWeek(new Date(2026, 5, 20), 0)).toEqual(new Date(2026, 5, 14))
  })
  it('detects when now is in a later week than the tracked week start', () => {
    const weekStart = new Date(2026, 5, 15) // Mon
    expect(hasWeekRolledOver(weekStart, new Date(2026, 5, 19), 1)).toBe(false) // same week (Fri)
    expect(hasWeekRolledOver(weekStart, new Date(2026, 5, 22), 1)).toBe(true) // next Mon
  })
})

describe('continuous rotation', () => {
  it('returns the next day-type by completed count, wrapping around', () => {
    const rot = ['push', 'pull', 'legs']
    expect(nextInRotation(rot, 0)).toBe('push')
    expect(nextInRotation(rot, 2)).toBe('legs')
    expect(nextInRotation(rot, 3)).toBe('push')
    expect(nextInRotation([], 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- scheduling`
Expected: FAIL — cannot find module `./scheduling`.

- [ ] **Step 3: Implement `src/domain/scheduling.ts`**

```ts
// --- Deload cadence & debt ---

export function isScheduledDeload(microcycleNumber: number, deloadEveryN: number | null): boolean {
  if (!deloadEveryN || deloadEveryN <= 0) return false
  return microcycleNumber % deloadEveryN === 0
}

export function shouldDeload(
  microcycleNumber: number,
  deloadEveryN: number | null,
  carriedDebt: boolean,
): boolean {
  return isScheduledDeload(microcycleNumber, deloadEveryN) || carriedDebt
}

/** At microcycle end: a deload that was due but not actually performed is owed forward. */
export function nextDeloadDebt(deloadWasDue: boolean, actuallyDeloaded: boolean): boolean {
  return deloadWasDue && !actuallyDeloaded
}

// --- Calendar-week slate ---

/** Day-types not yet completed this week, in their original order. */
export function remainingSlate<T>(allDayTypes: T[], completedThisWeek: T[]): T[] {
  const done = new Set(completedThisWeek)
  return allDayTypes.filter((d) => !done.has(d))
}

/** Midnight of the week-start day (weekStartsOn: 0=Sun..6=Sat) containing `d`. */
export function startOfWeek(d: Date, weekStartsOn: number): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = (date.getDay() - weekStartsOn + 7) % 7
  date.setDate(date.getDate() - diff)
  return date
}

/** True if `now` falls in a strictly later week than `currentWeekStart`. */
export function hasWeekRolledOver(currentWeekStart: Date, now: Date, weekStartsOn: number): boolean {
  return startOfWeek(now, weekStartsOn).getTime() > startOfWeek(currentWeekStart, weekStartsOn).getTime()
}

// --- Continuous rotation ---

/** The next day-type in order, advancing by completed count; null if there are none. */
export function nextInRotation<T>(orderedDayTypes: T[], completedCount: number): T | null {
  if (orderedDayTypes.length === 0) return null
  return orderedDayTypes[completedCount % orderedDayTypes.length]
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- scheduling`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/scheduling.ts src/domain/scheduling.test.ts
git commit -m "feat(domain): scheduling, microcycle, and deload logic"
```

---

## Task 5: Domain barrel export

**Files:**
- Create: `src/domain/index.ts`

- [ ] **Step 1: Create `src/domain/index.ts`**

```ts
export * from './types'
export * from './units'
export * from './energy'
export * from './suggestion'
export * from './scheduling'
```

- [ ] **Step 2: Verify the whole suite and the build**

Run: `npm test`
Expected: all suites pass (units, energy, suggestion, scheduling, plus the existing i18n/auth/theme tests).

Run: `npm run build`
Expected: succeeds (TypeScript compiles the new modules cleanly).

- [ ] **Step 3: Commit**

```bash
git add src/domain/index.ts
git commit -m "feat(domain): public barrel export"
```

---

## Self-Review Notes (verified against spec §7)

- **Energy math (spec §7):** Mifflin–St Jeor (male +5 / female −161), TDEE = BMR × activity, goal target −20% cut / +12% bulk / 0% maintain ✓ (Task 2). `ageFromDate` is pure (caller passes `on`) ✓.
- **Suggestion engine (spec §7 + locked rules):** double progression, goal-gated RIR (1/2/3), mechanic increments (2.5 / 1.25), deload reduction, null-on-no-history, structured `reason` (no i18n in domain) ✓ (Task 3).
- **Scheduling (spec §7):** deload-every-N + carry-forward debt, calendar-week slate + rollover with configurable week start, continuous rotation ✓ (Task 4).
- **Layering (spec §4):** zero Supabase/React/i18n imports; no `Date.now()`/`Math.random()` inside functions ✓.
- **Type consistency:** `Goal`, `Mechanic`, `RepRange`, `SetResult` defined once in `types.ts` and reused across `suggestion.ts`; `Suggestion.reason` codes match the test assertions; `RIR_GATE` keys match `Goal` ✓.
- **Naming:** `suggestNextSetOne`, `mifflinStJeorBmr`, `calorieTarget`, `shouldDeload`, `nextInRotation`, `remainingSlate` used consistently between tests and implementations ✓.
```
