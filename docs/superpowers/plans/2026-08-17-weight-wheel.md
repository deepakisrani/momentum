# Scroll-Wheel Weight Logger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace typed weight entry with a scrollable 0.1-step drum picker everywhere weight is logged, and fix the leading-zero bug in the app's controlled number inputs.

**Architecture:** All wheel arithmetic (value generation, scroll↔value mapping, keyboard stepping, clamping) lives in a pure, unit-tested module; `WeightWheel.tsx` owns only DOM concerns and uses native CSS scroll-snap for the physics. A shared `NumberField` (text input + `inputMode`, string state while focused) serves both the wheel's typed fallback and the three broken meso-builder fields, sidestepping React's `type="number"` coercion path entirely.

**Tech Stack:** React 18 + TypeScript, Tailwind, Vitest + @testing-library/react, Supabase (unchanged — no schema work in this plan).

**Spec:** `docs/superpowers/specs/2026-08-17-weight-wheel-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/features/profile/weightWheel.ts` | **Create.** Pure value/scroll math + constants. No DOM, no React. |
| `src/features/profile/weightWheel.test.ts` | **Create.** Unit tests for the above. |
| `src/components/NumberField.tsx` | **Create.** Numeric text input with internal string state. |
| `src/components/NumberField.test.tsx` | **Create.** Regression tests for the leading-zero bug. |
| `src/components/WeightWheel.tsx` | **Create.** The drum picker + spinbutton semantics + typed fallback. |
| `src/components/WeightWheel.test.tsx` | **Create.** Keyboard/ARIA/fallback tests (jsdom cannot scroll). |
| `src/features/profile/LogWeightModal.tsx` | **Create.** Extracted from `GoalsPage.tsx`, now wheel-based. Reused by Goals + Dashboard. |
| `src/features/mesos/MesoBuilderPage.tsx` | **Modify** lines 136–141. Three numeric fields → `NumberField`. |
| `src/features/profile/GoalsPage.tsx` | **Modify.** Drop the inline modal, import the extracted one. |
| `src/features/profile/DashboardPage.tsx` | **Modify.** Add quick-log button using the same modal. |
| `src/features/profile/EditStatsPage.tsx` | **Modify** line 70. Weight field → `WeightWheel`. |
| `src/features/profile/OnboardingPage.tsx` | **Modify** line 98. Weight field → `WeightWheel`. |
| `src/i18n/strings/en.json` | **Modify.** New `metrics.*` keys. |

Tasks are ordered so each one leaves the app working: the pure module, then `NumberField`, then the meso-builder bug fix (independently shippable), then the wheel, then its four call sites.

---

## Task 1: Pure wheel math

**Files:**
- Create: `src/features/profile/weightWheel.ts`
- Test: `src/features/profile/weightWheel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/profile/weightWheel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildWheelValues, indexOfNearest, valueAtScroll, scrollTopForIndex, stepValue,
  clampWeight, defaultAnchor, ROW_HEIGHT, WHEEL_MIN, WHEEL_MAX,
} from './weightWheel'

describe('buildWheelValues', () => {
  it('spans anchor +/- 15 in ascending 0.1 steps', () => {
    const v = buildWheelValues(78)
    expect(v[0]).toBe(63)
    expect(v[v.length - 1]).toBe(93)
    expect(v.length).toBe(301)
    expect(v[1] - v[0]).toBeCloseTo(0.1, 10)
  })

  it('holds exact one-decimal values with no float drift', () => {
    const v = buildWheelValues(78)
    // 78 - 15 = 63, so 78.1 sits at index 151.
    expect(v[151]).toBe(78.1)
    expect(v.every((n) => n === Math.round(n * 10) / 10)).toBe(true)
    expect(v.map(String).some((s) => s.includes('0000'))).toBe(false)
  })

  it('honours a custom span and step', () => {
    expect(buildWheelValues(50, { span: 0.2 })).toEqual([49.8, 49.9, 50, 50.1, 50.2])
    expect(buildWheelValues(50, { span: 2, step: 1 })).toEqual([48, 49, 50, 51, 52])
  })

  it('clamps to the global bounds, still returning a usable list', () => {
    const low = buildWheelValues(WHEEL_MIN + 1)
    expect(low[0]).toBe(WHEEL_MIN)
    const high = buildWheelValues(WHEEL_MAX - 1)
    expect(high[high.length - 1]).toBe(WHEEL_MAX)
    expect(low.length).toBeGreaterThan(1)
    expect(high.length).toBeGreaterThan(1)
  })
})

describe('indexOfNearest', () => {
  const values = [78, 78.1, 78.2, 78.3]
  it('finds an exact value', () => { expect(indexOfNearest(values, 78.2)).toBe(2) })
  it('finds the closest when between two values', () => { expect(indexOfNearest(values, 78.17)).toBe(2) })
  it('clamps below and above the list', () => {
    expect(indexOfNearest(values, 10)).toBe(0)
    expect(indexOfNearest(values, 400)).toBe(3)
  })
  it('is safe on an empty list', () => { expect(indexOfNearest([], 78)).toBe(0) })
})

describe('valueAtScroll', () => {
  const values = [78, 78.1, 78.2]
  it('maps a zero offset to the first value', () => {
    expect(valueAtScroll(0, ROW_HEIGHT, values)).toBe(78)
  })
  it('rounds to the nearest row', () => {
    expect(valueAtScroll(ROW_HEIGHT * 1.4, ROW_HEIGHT, values)).toBe(78.1)
    expect(valueAtScroll(ROW_HEIGHT * 1.6, ROW_HEIGHT, values)).toBe(78.2)
  })
  it('clamps overscroll at both ends', () => {
    expect(valueAtScroll(-500, ROW_HEIGHT, values)).toBe(78)
    expect(valueAtScroll(99999, ROW_HEIGHT, values)).toBe(78.2)
  })
})

describe('scrollTopForIndex', () => {
  it('round-trips with indexOfNearest', () => {
    const values = buildWheelValues(78)
    const top = scrollTopForIndex(indexOfNearest(values, 79.4), ROW_HEIGHT)
    expect(valueAtScroll(top, ROW_HEIGHT, values)).toBe(79.4)
  })
})

describe('stepValue', () => {
  const values = [78, 78.1, 78.2]
  it('steps up and down', () => {
    expect(stepValue(values, 1, 1)).toBe(78.2)
    expect(stepValue(values, 1, -1)).toBe(78)
  })
  it('clamps at both ends', () => {
    expect(stepValue(values, 0, -10)).toBe(78)
    expect(stepValue(values, 2, 10)).toBe(78.2)
  })
})

describe('clampWeight', () => {
  it('clamps to the global bounds', () => {
    expect(clampWeight(5)).toBe(WHEEL_MIN)
    expect(clampWeight(9999)).toBe(WHEEL_MAX)
    expect(clampWeight(78.4)).toBe(78.4)
  })
})

describe('defaultAnchor', () => {
  it('is a sensible starting weight per unit system', () => {
    expect(defaultAnchor('metric')).toBe(70)
    expect(defaultAnchor('imperial')).toBe(154)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/profile/weightWheel.test.ts`
Expected: FAIL — `Failed to resolve import "./weightWheel"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/profile/weightWheel.ts`:

```ts
import type { Units } from '../../domain/types'

/** Wheel granularity, in the user's display unit (kg or lb). */
export const WHEEL_STEP = 0.1
/** How far above/below the anchor the wheel generates values, in display units. */
export const WHEEL_SPAN = 15
/** Row height in px. Must stay in sync with the row class in WeightWheel (h-10). */
export const ROW_HEIGHT = 40
/** Hard bounds for any bodyweight, in display units. */
export const WHEEL_MIN = 20
export const WHEEL_MAX = 400

export interface WheelOpts {
  span?: number
  step?: number
  min?: number
  max?: number
}

/** Ascending values around `anchor`. Generated in integer steps then scaled, so the
 * list holds 78.1 rather than 78.10000000000001. */
export function buildWheelValues(anchor: number, opts: WheelOpts = {}): number[] {
  const { span = WHEEL_SPAN, step = WHEEL_STEP, min = WHEEL_MIN, max = WHEEL_MAX } = opts
  const scale = Math.round(1 / step)
  const lo = Math.round(Math.max(min, anchor - span) * scale)
  const hi = Math.round(Math.min(max, anchor + span) * scale)
  const out: number[] = []
  for (let n = lo; n <= hi; n += 1) out.push(n / scale)
  return out
}

export function clampWeight(value: number, min = WHEEL_MIN, max = WHEEL_MAX): number {
  return Math.min(max, Math.max(min, value))
}

/** Index of the value closest to `value`; clamps to the list's ends. */
export function indexOfNearest(values: number[], value: number): number {
  if (values.length === 0) return 0
  let best = 0
  let bestDist = Math.abs(values[0] - value)
  for (let i = 1; i < values.length; i += 1) {
    const d = Math.abs(values[i] - value)
    if (d < bestDist) { best = i; bestDist = d }
  }
  return best
}

export function scrollTopForIndex(index: number, rowHeight = ROW_HEIGHT): number {
  return index * rowHeight
}

/** Snapped value for a scroll offset. Clamps, so overscroll cannot leave the range. */
export function valueAtScroll(scrollTop: number, rowHeight: number, values: number[]): number {
  if (values.length === 0) return 0
  const i = Math.min(values.length - 1, Math.max(0, Math.round(scrollTop / rowHeight)))
  return values[i]
}

/** Keyboard stepping: `delta` rows from `index`, clamped to the list. */
export function stepValue(values: number[], index: number, delta: number): number {
  if (values.length === 0) return 0
  const i = Math.min(values.length - 1, Math.max(0, index + delta))
  return values[i]
}

/** Starting weight when the user has never logged one (onboarding). */
export function defaultAnchor(units: Units): number {
  return units === 'imperial' ? 154 : 70
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/profile/weightWheel.test.ts`
Expected: PASS — 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/weightWheel.ts src/features/profile/weightWheel.test.ts
git commit -m "feat(metrics): pure value/scroll math for the weight wheel"
```

---

## Task 2: NumberField (fixes the leading-zero bug)

**Files:**
- Create: `src/components/NumberField.tsx`
- Test: `src/components/NumberField.test.tsx`

Background you need: a controlled `<input type="number">` holding **numeric** state cannot behave. Clearing it makes `Number('') === 0`, so React writes `"0"` back into the field; typing then leaves `node.value === "01"`, which is *loosely* equal to `1`, so React's `updateWrapper` (`react-dom.development.js:1829-1838`) declines to normalize it. This component uses a **text** input with local string state, which never enters that code path.

- [ ] **Step 1: Write the failing test**

Create `src/components/NumberField.test.tsx`:

```tsx
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { NumberField } from './NumberField'

/** Controlled harness — mirrors how pages use the field (numeric state upstream). */
function Harness({ initial = 8, min, max, decimal }: { initial?: number; min?: number; max?: number; decimal?: boolean }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <NumberField value={value} onChange={setValue} min={min} max={max} decimal={decimal} ariaLabel="reps" />
      <output data-testid="committed">{value}</output>
    </>
  )
}

describe('NumberField', () => {
  it('stays empty when cleared and does not inject a zero', async () => {
    const user = userEvent.setup()
    render(<Harness initial={8} />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    expect(input).toHaveValue('')
  })

  it('does not leave a leading zero after clearing and retyping', async () => {
    const user = userEvent.setup()
    render(<Harness initial={8} />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '1')
    expect(input).toHaveValue('1')
    expect(screen.getByTestId('committed')).toHaveTextContent('1')
  })

  it('normalizes a typed leading zero on blur', async () => {
    const user = userEvent.setup()
    render(<Harness initial={8} />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '007')
    await user.tab()
    expect(input).toHaveValue('7')
    expect(screen.getByTestId('committed')).toHaveTextContent('7')
  })

  it('reverts to the last committed value when blurred empty', async () => {
    const user = userEvent.setup()
    render(<Harness initial={8} />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.tab()
    expect(input).toHaveValue('8')
    expect(screen.getByTestId('committed')).toHaveTextContent('8')
  })

  it('clamps to min and max on blur', async () => {
    const user = userEvent.setup()
    render(<Harness initial={5} min={1} max={20} />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '99')
    await user.tab()
    expect(input).toHaveValue('20')
    expect(screen.getByTestId('committed')).toHaveTextContent('20')
  })

  it('rejects non-numeric characters', async () => {
    const user = userEvent.setup()
    render(<Harness initial={8} />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '1a2')
    expect(input).toHaveValue('12')
  })

  it('accepts a decimal point only when decimal is set', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} decimal />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '78.4')
    expect(input).toHaveValue('78.4')
    expect(screen.getByTestId('committed')).toHaveTextContent('78.4')
  })
})
```

- [ ] **Step 2: Install the interaction helper, then run the test to verify it fails**

`@testing-library/user-event` is not yet a dependency (the existing tests only render). Add it:

```bash
npm install --save-dev @testing-library/user-event
```

Run: `npx vitest run src/components/NumberField.test.tsx`
Expected: FAIL — `Failed to resolve import "./NumberField"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/NumberField.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'

/** Numeric input that owns its text while focused.
 *
 * A controlled `<input type="number">` with numeric state misbehaves: clearing yields
 * Number('') === 0 so React writes "0" into the field, and a following "01" is loosely
 * equal to 1 so React refuses to normalize it (react-dom updateWrapper). A text input
 * with local string state avoids that path entirely. */
export function NumberField({
  value, onChange, min, max, decimal = false, className, ariaLabel,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  decimal?: boolean
  className?: string
  ariaLabel?: string
}) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)

  // Follow external changes only while not being edited, so typing is never interrupted.
  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])

  function clamp(n: number): number {
    let out = n
    if (min != null) out = Math.max(min, out)
    if (max != null) out = Math.min(max, out)
    return out
  }

  function onInput(raw: string) {
    const pattern = decimal ? /^\d*\.?\d*$/ : /^\d*$/
    if (!pattern.test(raw)) return // reject the keystroke rather than mangle the text
    setText(raw)
    const n = Number(raw)
    if (raw !== '' && Number.isFinite(n)) onChange(clamp(n))
  }

  function commit() {
    focused.current = false
    const n = Number(text)
    if (text === '' || !Number.isFinite(n)) {
      setText(String(value)) // nothing usable typed — restore what is committed
      return
    }
    const clamped = clamp(n)
    setText(String(clamped)) // normalizes "007" -> "7"
    if (clamped !== value) onChange(clamped)
  }

  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={className}
      aria-label={ariaLabel}
      value={text}
      onFocus={() => { focused.current = true }}
      onChange={(e) => onInput(e.target.value)}
      onBlur={commit}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/NumberField.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/NumberField.tsx src/components/NumberField.test.tsx package.json package-lock.json
git commit -m "feat(ui): NumberField with string-backed state

Controlled type=number inputs holding numeric state inject a 0 on clear and
keep a stuck leading zero, because react-dom's updateWrapper compares
node.value != value loosely for number inputs."
```

---

## Task 3: Fix the meso builder's numeric fields

**Files:**
- Modify: `src/features/mesos/MesoBuilderPage.tsx:136-141`

- [ ] **Step 1: Add the import**

At the top of `src/features/mesos/MesoBuilderPage.tsx`, alongside the existing component imports:

```tsx
import { NumberField } from '../../components/NumberField'
```

- [ ] **Step 2: Replace the three inputs**

Replace lines 136–141 (the sets/reps block inside the exercise `<li>`) with:

```tsx
                    <label className="flex items-center gap-1">{t('meso.sets')}
                      <NumberField className={numField} value={ex.targetSets} min={1} max={20} ariaLabel={t('meso.sets')} onChange={(n) => update((d) => { d.days[activeDay].exercises[j].targetSets = n })} />
                    </label>
                    <label className="flex items-center gap-1">{t('meso.reps')}
                      <NumberField className={numField} value={ex.repMin} min={1} max={100} ariaLabel={t('meso.reps')} onChange={(n) => update((d) => { d.days[activeDay].exercises[j].repMin = n })} />
                      <span>–</span>
                      <NumberField className={numField} value={ex.repMax} min={1} max={100} ariaLabel={t('meso.reps')} onChange={(n) => update((d) => { d.days[activeDay].exercises[j].repMax = n })} />
                    </label>
```

The `min="1"` attributes are gone because `NumberField` clamps in JS; `numField` and the surrounding markup are otherwise unchanged.

- [ ] **Step 3: Verify the suite and types still pass**

Run: `npm test`
Expected: PASS — all existing tests plus the two new files.

Run: `npx tsc -b`
Expected: no output (clean).

- [ ] **Step 4: Verify by hand in the running app**

Run: `npm run dev`, open a meso in the builder, then in a "sets" field: select the contents and delete.
Expected: the field is **empty** — no `0` appears. Type `4`: the field reads `4`, not `04`.
(`MesoBuilderPage` is not unit-tested here — it needs a router, auth, and Supabase. The behaviour is covered by `NumberField.test.tsx`; this step confirms the wiring.)

- [ ] **Step 5: Commit**

```bash
git add src/features/mesos/MesoBuilderPage.tsx
git commit -m "fix(meso): no injected zero or stuck leading zero in sets/reps fields"
```

---

## Task 4: WeightWheel component

**Files:**
- Create: `src/components/WeightWheel.tsx`
- Test: `src/components/WeightWheel.test.tsx`
- Modify: `src/i18n/strings/en.json`

jsdom implements no scroll physics, so the tests drive keyboard and the typed fallback; the scroll mapping itself is covered by Task 1.

- [ ] **Step 1: Add the i18n keys**

Add to `src/i18n/strings/en.json` (flat object — position does not matter):

```json
  "metrics.typeValue": "Type value",
  "metrics.useWheel": "Use wheel",
  "metrics.weightWheelLabel": "Weight, scroll to adjust",
  "metrics.logTodaysWeight": "Log today's weight",
```

- [ ] **Step 2: Write the failing test**

Create `src/components/WeightWheel.test.tsx`:

```tsx
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { WeightWheel } from './WeightWheel'

function Harness({ initial = 78.4 }: { initial?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <WeightWheel value={value} onChange={setValue} unitLabel="kg" label="Weight" />
      <output data-testid="committed">{value}</output>
    </>
  )
}

describe('WeightWheel', () => {
  it('exposes spinbutton semantics with a unit-qualified value', () => {
    render(<Harness />)
    const wheel = screen.getByRole('spinbutton', { name: 'Weight' })
    expect(wheel).toHaveAttribute('aria-valuetext', '78.4 kg')
    expect(wheel).toHaveAttribute('aria-valuenow', '78.4')
  })

  it('steps by 0.1 on arrow keys', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const wheel = screen.getByRole('spinbutton', { name: 'Weight' })
    wheel.focus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByTestId('committed')).toHaveTextContent('78.5')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByTestId('committed')).toHaveTextContent('78.3')
  })

  it('steps by 1 on page keys', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const wheel = screen.getByRole('spinbutton', { name: 'Weight' })
    wheel.focus()
    await user.keyboard('{PageUp}')
    expect(screen.getByTestId('committed')).toHaveTextContent('79.4')
  })

  it('jumps to the window bounds with Home and End', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    const wheel = screen.getByRole('spinbutton', { name: 'Weight' })
    wheel.focus()
    await user.keyboard('{Home}')
    expect(screen.getByTestId('committed')).toHaveTextContent('63')
    await user.keyboard('{End}')
    expect(screen.getByTestId('committed')).toHaveTextContent('93')
  })

  it('accepts a value far outside the window through the typed fallback', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    await user.click(screen.getByRole('button', { name: 'Type value' }))
    const input = screen.getByLabelText('Weight')
    await user.clear(input)
    await user.type(input, '120')
    await user.tab()
    expect(screen.getByTestId('committed')).toHaveTextContent('120')
  })

  it('re-anchors the wheel around a value typed outside the old window', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    await user.click(screen.getByRole('button', { name: 'Type value' }))
    const input = screen.getByLabelText('Weight')
    await user.clear(input)
    await user.type(input, '120')
    await user.click(screen.getByRole('button', { name: 'Use wheel' }))
    const wheel = screen.getByRole('spinbutton', { name: 'Weight' })
    expect(wheel).toHaveAttribute('aria-valuenow', '120')
    expect(wheel).toHaveAttribute('aria-valuemin', '105')
    expect(wheel).toHaveAttribute('aria-valuemax', '135')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/WeightWheel.test.tsx`
Expected: FAIL — `Failed to resolve import "./WeightWheel"`.

- [ ] **Step 4: Write minimal implementation**

Create `src/components/WeightWheel.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n/I18nProvider'
import { NumberField } from './NumberField'
import {
  buildWheelValues, clampWeight, indexOfNearest, scrollTopForIndex, stepValue,
  valueAtScroll, ROW_HEIGHT, WHEEL_MAX, WHEEL_MIN,
} from '../features/profile/weightWheel'

/** Drum picker for a weight in display units, snapping to 0.1.
 *
 * Values are windowed around an anchor (see weightWheel.ts) because 0.1 steps across the
 * full range would be thousands of DOM rows. The typed fallback is both the accessible
 * path and the way to reach a value outside the window. */
export function WeightWheel({ value, onChange, unitLabel, label }: {
  value: number
  onChange: (v: number) => void
  unitLabel: string
  label: string
}) {
  const t = useT()
  const [anchor, setAnchor] = useState(() => clampWeight(value))
  const [typing, setTyping] = useState(false)
  const values = useMemo(() => buildWheelValues(anchor), [anchor])
  const listRef = useRef<HTMLDivElement | null>(null)
  const frame = useRef<number | null>(null)
  const positionedFor = useRef<number | null>(null)

  // Position once per anchor. Guarded so a re-render mid-flick never yanks the list back.
  useEffect(() => {
    const el = listRef.current
    if (!el || positionedFor.current === anchor) return
    positionedFor.current = anchor
    el.scrollTop = scrollTopForIndex(indexOfNearest(values, value), ROW_HEIGHT)
  }, [anchor, values, value])

  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current) }, [])

  function onScroll() {
    if (frame.current != null) return // coalesce a burst of scroll events into one frame
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const el = listRef.current
      if (!el) return
      const next = valueAtScroll(el.scrollTop, ROW_HEIGHT, values)
      if (next !== value) onChange(next)
    })
  }

  function scrollToValue(next: number) {
    const el = listRef.current
    if (!el?.scrollTo) return // jsdom has no scrollTo
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: scrollTopForIndex(indexOfNearest(values, next), ROW_HEIGHT), behavior: reduce ? 'auto' : 'smooth' })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Spinbutton convention: ArrowUp/PageUp INCREASE the value. Values ascend with the
    // index (and so downward on screen), so "up" is a positive index delta.
    const rows: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }
    let next: number | null = null
    if (e.key in rows) next = stepValue(values, indexOfNearest(values, value), rows[e.key])
    else if (e.key === 'Home') next = values[0]
    else if (e.key === 'End') next = values[values.length - 1]
    if (next == null) return
    e.preventDefault()
    onChange(next)
    scrollToValue(next)
  }

  const fade = 'pointer-events-none absolute inset-x-0 h-20 from-white to-transparent dark:from-[#1b2030]'

  if (typing) {
    return (
      <div className="space-y-2">
        <NumberField
          value={value}
          onChange={onChange}
          decimal
          min={WHEEL_MIN}
          max={WHEEL_MAX}
          ariaLabel={label}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-2xl font-bold tabular-nums text-slate-900 dark:border-slate-700 dark:bg-[#0f1115] dark:text-white"
        />
        <button type="button" onClick={() => { setAnchor(clampWeight(value)); setTyping(false) }} className="w-full text-xs font-semibold text-brand-700 dark:text-brand-400">
          {t('metrics.useWheel')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={listRef}
          role="spinbutton"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={values[0]}
          aria-valuemax={values[values.length - 1]}
          aria-valuenow={value}
          aria-valuetext={`${value.toFixed(1)} ${unitLabel}`}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          className="h-[200px] snap-y snap-mandatory overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div style={{ height: ROW_HEIGHT * 2 }} />
          {values.map((v) => (
            <div key={v} className="flex h-10 snap-center items-center justify-center text-lg tabular-nums" aria-hidden="true">
              {v.toFixed(1)}
            </div>
          ))}
          <div style={{ height: ROW_HEIGHT * 2 }} />
        </div>
        <div className={`${fade} top-0 bg-gradient-to-b`} />
        <div className={`${fade} bottom-0 bg-gradient-to-t`} />
        <div className="pointer-events-none absolute inset-x-0 top-20 h-10 rounded-md border-y-2 border-brand-600" />
      </div>
      <div className="text-center text-sm text-slate-500 dark:text-slate-400">{unitLabel}</div>
      <button type="button" onClick={() => setTyping(true)} className="w-full text-xs font-semibold text-brand-700 dark:text-brand-400">
        {t('metrics.typeValue')}
      </button>
    </div>
  )
}
```

Layout invariant worth understanding before you touch the classes: the viewport is 200px and rows are 40px (`h-10`), so the two-row (80px) spacers put row *n*'s centre at the viewport centre exactly when `scrollTop === n * 40` — which is what `scrollTopForIndex` returns. The selection band is `top-20 h-10` (80–120px) for the same reason.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/WeightWheel.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/WeightWheel.tsx src/components/WeightWheel.test.tsx src/i18n/strings/en.json
git commit -m "feat(metrics): scroll-snap weight wheel with spinbutton keys and typed fallback"
```

---

## Task 5: Extract LogWeightModal and put the wheel in it

**Files:**
- Create: `src/features/profile/LogWeightModal.tsx`
- Modify: `src/features/profile/GoalsPage.tsx` (remove the inline modal at lines 97–139; import the new one)

- [ ] **Step 1: Create the extracted, wheel-based modal**

Create `src/features/profile/LogWeightModal.tsx`:

```tsx
import { useState } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { useUnits } from './useUnits'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { addWeight } from '../../data/weightRepo'
import { WeightWheel } from '../../components/WeightWheel'
import { todayIso } from './today'

/** Logs today's weigh-in. `initialWeight` is in display units — the caller converts. */
export function LogWeightModal({ userId, initialWeight, onClose, onSaved }: {
  userId: string
  initialWeight: number
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const t = useT()
  const u = useUnits()
  useBodyScrollLock()
  const [value, setValue] = useState(initialWeight)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true); setError(null)
    try {
      await addWeight(userId, todayIso(), u.fromWeight(value))
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
        <WeightWheel value={value} onChange={setValue} unitLabel={u.weightLabel} label={t('metrics.weightWheelLabel')} />
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

The save path is unchanged from the old inline modal: `addWeight` still upserts on `(user_id, logged_on)`, so re-logging the same day overwrites.

- [ ] **Step 2: Point GoalsPage at it**

In `src/features/profile/GoalsPage.tsx`:

1. Delete the entire `function LogWeightModal(...)` block at the bottom of the file (lines 97–139).
2. Remove the now-unused imports `addWeight`, `useBodyScrollLock`, and `todayIso` — but **keep** `listWeights`, which the chart still uses. The `addWeight` import line becomes:

```tsx
import { listWeights } from '../../data/weightRepo'
```

3. Add:

```tsx
import { LogWeightModal } from './LogWeightModal'
```

4. Change the render call to pass the initial weight in display units:

```tsx
      {modalOpen && (
        <LogWeightModal
          userId={session.user.id}
          initialWeight={u.toWeight(latestWeight.weight_kg)}
          onClose={() => setModalOpen(false)}
          onSaved={async () => { await reload(); loadWeights(); setModalOpen(false) }}
        />
      )}
```

- [ ] **Step 3: Verify types and tests**

Run: `npx tsc -b`
Expected: no output. (If it reports an unused import in `GoalsPage.tsx`, remove that import — step 2.2 lists the ones to drop.)

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Verify by hand**

Run `npm run dev`, go to User Metrics → "Log Weight".
Expected: the wheel opens centred on your current weight; flicking changes the value; "Type value" swaps to a text field; Save closes the modal and the trend chart picks up the new point.

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/LogWeightModal.tsx src/features/profile/GoalsPage.tsx
git commit -m "feat(metrics): wheel-based LogWeightModal, extracted from GoalsPage"
```

---

## Task 6: Dashboard quick-log

**Files:**
- Modify: `src/features/profile/DashboardPage.tsx`

- [ ] **Step 1: Add the modal to the dashboard**

In `src/features/profile/DashboardPage.tsx`, add imports:

```tsx
import { LogWeightModal } from './LogWeightModal'
import { useUnits } from './useUnits'
```

Add state next to the existing `hasActiveSession` state:

```tsx
  const [logOpen, setLogOpen] = useState(false)
```

Add `const u = useUnits()` beside the existing hooks. Then, inside the `<div className="space-y-3">` block, directly after the `/workout` `<Link>`:

```tsx
          <button onClick={() => setLogOpen(true)} className={`${card} bg-slate-100 text-center dark:bg-[#1b2030]`}>
            {t('metrics.logTodaysWeight')}
          </button>
```

And immediately before the closing `</div>` of the outermost page wrapper:

```tsx
        {logOpen && (
          <LogWeightModal
            userId={session!.user.id}
            initialWeight={u.toWeight(latestWeight.weight_kg)}
            onClose={() => setLogOpen(false)}
            onSaved={() => setLogOpen(false)}
          />
        )}
```

`session!` is safe here: the component already returns `null` above unless `profile`, `latestWeight`, and `latestGoal` are all loaded, which only happens for an authenticated user.

- [ ] **Step 2: Refresh the summary after saving**

The dashboard's calorie target is derived from `latestWeight`, so the save must refresh profile data. Take `reload` from the existing hook call:

```tsx
  const { profile, latestWeight, latestGoal, reload } = useProfileData()
```

and use it in `onSaved`:

```tsx
            onSaved={async () => { await reload(); setLogOpen(false) }}
```

- [ ] **Step 3: Verify**

Run: `npx tsc -b`
Expected: no output.

Run: `npm test`
Expected: PASS.

Run `npm run dev` and use the dashboard button.
Expected: the wheel modal opens, saving closes it, and the "target calories" line reflects the new weight.

- [ ] **Step 4: Commit**

```bash
git add src/features/profile/DashboardPage.tsx
git commit -m "feat(dashboard): one-tap weigh-in from the home screen"
```

---

## Task 7: Edit Stats weight field

**Files:**
- Modify: `src/features/profile/EditStatsPage.tsx:34,70`

- [ ] **Step 1: Switch the field to the wheel**

Add the import:

```tsx
import { WeightWheel } from '../../components/WeightWheel'
```

Change the weight state from a string to a number (line 34):

```tsx
  const [weight, setWeight] = useState<number>(() => (latestWeight ? u.toWeight(latestWeight.weight_kg) : 70))
```

Replace the weight `<label>` (line 69–71) with:

```tsx
        <div className="text-sm">{t('onboarding.weight')} ({u.weightLabel})
          <WeightWheel value={weight} onChange={setWeight} unitLabel={u.weightLabel} label={t('metrics.weightWheelLabel')} />
        </div>
```

It becomes a `<div>` rather than a `<label>` because the wheel is a composite widget with its own `aria-label`, not a single labelable control.

- [ ] **Step 2: Simplify the save path**

In `save()`, the weight is now always a number, so replace:

```tsx
      if (weight) await addWeight(userId, todayIso(), u.fromWeight(Number(weight)))
```

with:

```tsx
      await addWeight(userId, todayIso(), u.fromWeight(weight))
```

- [ ] **Step 3: Verify**

Run: `npx tsc -b`
Expected: no output.

Run: `npm test`
Expected: PASS.

Run `npm run dev`, go to User Metrics → "Reset Goal", change the weight on the wheel, save.
Expected: it saves and returns to `/goals` with the new weight shown in the stats card.

- [ ] **Step 4: Commit**

```bash
git add src/features/profile/EditStatsPage.tsx
git commit -m "feat(metrics): wheel for the weight field on Edit Stats"
```

---

## Task 8: Onboarding weight question

**Files:**
- Modify: `src/features/profile/OnboardingPage.tsx:28,98`

- [ ] **Step 1: Switch the field to the wheel**

Add imports:

```tsx
import { WeightWheel } from '../../components/WeightWheel'
import { defaultAnchor } from './weightWheel'
```

Change the weight state (line 28) from an empty string to a numeric default:

```tsx
  const [weightKg, setWeightKg] = useState<number>(() => defaultAnchor('metric'))
```

Replace the weight `<label>` (lines 97–99) with:

```tsx
        <div className="block text-sm">{t('onboarding.weight')} ({weightUnitLabel(units)})
          <WeightWheel value={weightKg} onChange={setWeightKg} unitLabel={weightUnitLabel(units)} label={t('metrics.weightWheelLabel')} />
        </div>
```

- [ ] **Step 2: Keep the value sane when the unit toggle changes**

Onboarding lets the user switch units *before* entering weight (the units `<select>` is at line 76), and the wheel's value is in display units. Rebase on toggle so 70 kg does not silently become 70 lb. Add this function next to `onSubmit`:

```tsx
  function changeUnits(next: Units) {
    // Only rebase an untouched default; a weight the user actually set is left alone.
    setWeightKg((w) => (w === defaultAnchor(units) ? defaultAnchor(next) : w))
    setUnits(next)
  }
```

Then change line 76 from `onChange={(e) => setUnits(e.target.value as Units)}` to:

```tsx
          <select className={field} value={units} onChange={(e) => changeUnits(e.target.value as Units)}>
```

- [ ] **Step 3: Simplify the submit path**

In `onSubmit`, replace:

```tsx
      await addWeight(userId, today, fromInputWeight(Number(weightKg), units))
```

with:

```tsx
      await addWeight(userId, today, fromInputWeight(weightKg, units))
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b`
Expected: no output.

Run: `npm test`
Expected: PASS — including the existing `onboardingStatus` and smoke tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/OnboardingPage.tsx
git commit -m "feat(onboarding): wheel for the initial weight question"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS, with no skipped files. Note the total count; `weightWheel` (16), `NumberField` (7), and `WeightWheel` (6) are new.

- [ ] **Step 2: Lint and typecheck**

Run: `npm run lint`
Expected: **exactly the pre-existing baseline** — `✖ 9 problems (3 errors, 6 warnings)`. Those 3 errors live on `main` already, in files this plan does not touch:

- `src/auth/RequireAuth.test.tsx:7` — `Unexpected any`
- `src/features/mesos/MesoListPage.tsx:26` — `'e' is defined but never used`
- `src/features/session/ExerciseLogPanel.tsx:46` — `'_' is assigned a value but never used`

Any *additional* error or warning is yours to fix. Do **not** fix the three above — they are outside this plan's scope.

Run: `npm run build`
Expected: completes and writes `dist/`.

- [ ] **Step 3: Manual pass on a phone-sized viewport**

In `npm run dev` with the browser at 390×844, check each surface: dashboard quick-log, Goals modal, Edit Stats, onboarding. For each — the wheel snaps to one decimal, the centre band lines up with the selected row, and "Type value" round-trips.
Also confirm dark mode: the gradient fades match the surface behind them (the modal is `#1b2030`).

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(metrics): polish from the manual wheel pass"
```

---

## Notes for the implementer

- **Do not** reintroduce `type="number"` on a controlled input whose state is a number. That is the exact bug Task 2 exists to remove; see the comment at the top of `NumberField.tsx`.
- `ROW_HEIGHT` in `weightWheel.ts` and the `h-10` row class in `WeightWheel.tsx` must stay in agreement. If you change one, change the other, and re-check the `top-20` selection band.
- The wheel works in **display units** throughout. `weight_log.weight_kg` is still kg; conversion happens at the `addWeight` call sites via `u.fromWeight`.
- Out of scope here: the parked next-set suggestion bug, and the `add_weight` rounding issue in `src/domain/suggestion.ts:73`. Do not fix them in this plan.
