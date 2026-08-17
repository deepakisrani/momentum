# Scroll-wheel weight logger — design

**Date:** 2026-08-17
**Status:** Approved (design)

## Problem

Logging daily bodyweight means typing the whole number into a plain `<input
type="number">` every day (`LogWeightModal` in `GoalsPage.tsx`, the weight field on
`EditStatsPage`, and the onboarding weight question). Day-to-day change is typically
200–300 g, so retyping `78.4` -> `78.6` is disproportionate effort for the size of the
edit. The user wants to scroll to the value instead.

## Requirements

Confirmed during brainstorming:

1. **Control:** a vertical drum/wheel picker, snapping to 0.1 in the user's display
   unit, centred on the last logged weight.
2. **Range strategy:** values windowed around the last weight (not the full 30–250
   range), because 0.1 steps across the full range is ~2,200 DOM rows and janks on
   phones.
3. **Escape hatch:** a "type it" fallback for values outside the window and for
   keyboard/screen-reader users.
4. **Entry points:** the existing Goals-page modal, the Edit Stats form, the
   onboarding weight question, and a new dashboard quick-log.
5. **Storage unchanged:** the wheel works in display units and converts through the
   existing `useUnits().fromWeight` on save; `weight_log.weight_kg` stays kg.
6. **Also fix** the leading-zero/injected-zero behaviour of the app's controlled number
   inputs (see "Related fix" below) — reported alongside this work, and it shares the
   `NumberField` component with the wheel's typed fallback.

## Approach

Split the wheel into a pure value/scroll-math module and a thin presentational
component. All the arithmetic that can be wrong — value generation, float drift,
scroll offset to value, keyboard stepping, clamping — lives in the pure module and is
unit-tested. The component owns only DOM concerns (scroll position, snap, ARIA).

Native CSS scroll-snap does the physics: no animation loop, no gesture library, and
momentum/rubber-banding come from the platform. The component reads the snapped index
back out of `scrollTop`.

### Windowing

`buildWheelValues(anchor)` generates `anchor - 15` .. `anchor + 15` at 0.1 steps —
about 301 rows, cheap to render and smooth to flick. ±15 covers any realistic
day-to-day change; the "type it" fallback covers the rest (a first-ever entry, or a
large jump after a long gap). Values are generated as integer tenths and divided by
10, so the list contains `78.1`, never `78.10000000000001`.

The window is expressed in display units, so it is ±15 kg in metric and ±15 lb
(~6.8 kg) in imperial. That is narrower in imperial but still far beyond daily
variation, and the typed fallback covers the outliers. Clamped to 20–400 display
units. With no previous weigh-in (onboarding), the anchor defaults to 70 kg / 154 lb.

## Module boundaries

- **`src/features/profile/weightWheel.ts`** (pure, no DOM)
  - `WHEEL_STEP = 0.1`, `WHEEL_SPAN = 15`, `ROW_HEIGHT = 40`.
  - `buildWheelValues(anchor: number, opts?: { span?: number; step?: number; min?: number; max?: number }): number[]`
    — ascending values, generated in integer tenths then scaled, clamped to
    `[min=20, max=400]`.
  - `indexOfNearest(values: number[], value: number): number` — index of the closest
    value; used to position the wheel initially and after a typed entry.
  - `valueAtScroll(scrollTop: number, rowHeight: number, values: number[]): number` —
    `values[clamp(Math.round(scrollTop / rowHeight), 0, values.length - 1)]`.
  - `scrollTopForIndex(index: number, rowHeight: number): number` — `index * rowHeight`.
  - `stepValue(values: number[], index: number, delta: number): number` — keyboard
    stepping, clamped at both ends.
- **`src/components/WeightWheel.tsx`** (presentational)
  - Props: `{ value: number; onChange: (v: number) => void; unitLabel: string; anchor?: number; label: string }`.
  - Layout: a 200px-tall scroll container (five 40px rows) with
    `scroll-snap-type: y mandatory`, `snap-center` rows, and two-row spacers top and
    bottom so the first and last values can reach the centre. A `pointer-events-none`
    centre band marks the selection, with gradient masks above and below using the
    existing surface colours (`#0f1115` / `#1b2030` in dark, white in light).
  - Scroll handling: `onScroll` throttled with `requestAnimationFrame`; fires
    `onChange` only when the snapped index changes.
  - Initial position: a `useEffect` sets `scrollTop = scrollTopForIndex(indexOfNearest(values, value), ROW_HEIGHT)`
    once per mount/anchor change, behind a ref guard, so programmatic positioning
    never fights an in-progress flick.
  - Accessibility: the container is `role="spinbutton"` with `tabIndex={0}`,
    `aria-label`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and
    `aria-valuetext` (`"78.4 kg"`). `onKeyDown` handles ArrowUp/ArrowDown (±0.1),
    PageUp/PageDown (±1), Home/End (window bounds). Under
    `prefers-reduced-motion: reduce`, programmatic scrolling uses `behavior: 'auto'`.
  - A "type it" toggle swaps the wheel for the existing bordered number input
    (`step="0.1"`, `inputMode="decimal"`). On commit, the value is clamped to the
    **global** 20–400 bounds — not to the current window — and the wheel then
    re-anchors, rebuilding its values around the committed value. Clamping to the
    window here would defeat the purpose of the fallback. This is the accessible path
    and the large-jump path.
- **`src/features/profile/LogWeightModal.tsx`** (new file)
  - `LogWeightModal` is extracted verbatim from `GoalsPage.tsx` (which currently holds
    both the page and the modal) and switched to `WeightWheel`. Extracting it is what
    lets the dashboard quick-log reuse it rather than duplicate it.
  - Initial wheel value/anchor: the latest logged weight in display units, else the
    unit default.
  - Save path is unchanged: `addWeight(userId, todayIso(), u.fromWeight(value))`,
    which already upserts one weigh-in per day.

## Related fix: leading zero in controlled number inputs

Reported alongside this work: deleting the contents of a number field immediately
fills it with `0`, and typing after that leaves a stuck leading zero (`08`).

**Root cause** (confirmed in `react-dom` `updateWrapper`, `react-dom.development.js`
lines 1829–1838):

```js
if (type === 'number') {
  if (value === 0 && node.value === '' || node.value != value) { // loose !=, deliberate
    node.value = toString(value);
  }
}
```

The affected fields are target sets / rep min / rep max in `MesoBuilderPage.tsx:136-141`
— the only controlled `type="number"` inputs in the app holding **numeric** state:

1. Clearing the field gives `Number('') === 0`, so state becomes `0` and the re-render
   hits the first branch (`value === 0 && node.value === ''`) exactly, and React writes
   `"0"` into the input. React fills the field; the user did not.
2. Typing `1` then makes the DOM `"01"` -> `Number("01") === 1` -> state `1` -> on
   re-render `node.value != value` is `"01" != 1`, which loose equality coerces to
   `1 != 1` -> false, so React does not rewrite the DOM and the leading zero persists.

Every other numeric input in the app keeps **string** state, which is why only these
three misbehave. `ExerciseLogPanel.tsx:128` already models the correct pattern
(`inputMode="decimal"`, no `type="number"`).

**Fix — `src/components/NumberField.tsx`** (shared with the wheel's "type it" fallback):

- `<input type="text" inputMode="numeric" | "decimal">`, which bypasses React's
  number-input coercion path entirely, rather than fighting it.
- Props: `{ value: number; onChange: (n: number) => void; min?: number; max?: number; decimal?: boolean; className?: string; ariaLabel?: string }`.
- Internal string state is authoritative **while focused**, so an empty field stays
  empty and no zero is injected. It re-syncs from `value` when unfocused.
- On change: keep the raw text; call `onChange(parsed)` only when the text parses to a
  finite number. Non-numeric characters are rejected on input.
- On blur: an empty or unparseable field reverts to the last committed `value`; a valid
  one is normalized (`"007"` -> `"7"`) and clamped to `min`/`max`.
- Call sites in this change: the three `MesoBuilderPage` fields and the wheel's typed
  fallback. The `deloadEveryN` `<select>` at `MesoBuilderPage.tsx:94` is unaffected
  (a select, not a text input).

**Tests** — `NumberField.test.tsx`: clearing the field leaves it empty and does **not**
render `0`; typing after clearing shows `8` rather than `08`; a leading zero typed
directly is normalized on blur; blur on empty reverts to the previous value; `min`/`max`
clamping on blur; `onChange` fires with parsed numbers and not for partial input.

## Call sites

- **`GoalsPage.tsx`** — imports the extracted `LogWeightModal`; the "Log Weight"
  button is untouched.
- **`DashboardPage.tsx`** — new quick-log button that opens the same modal; on save it
  calls the existing `useProfileData().reload()`.
- **`EditStatsPage.tsx`** — the weight field becomes `WeightWheel` (anchored on the
  current weight); the rest of the form is untouched.
- **`OnboardingPage.tsx`** — the weight question becomes `WeightWheel` anchored at the
  unit default.

## Edge cases

- **No previous weigh-in:** anchor falls back to 70 kg / 154 lb; the typed fallback
  handles someone far from that.
- **Value outside the window** (e.g. a typed 120 with a 78 anchor): accepted as typed
  (clamped only to the global 20–400 bounds); the wheel re-anchors around it so 120 is
  centred and scrollable. The window follows the value, it does not constrain it.
- **Unit switch** while a wheel is mounted: `anchor`/`value` are display-unit props,
  so the wheel rebuilds from the converted value; no kg data is touched.
- **Same-day re-log:** unchanged behaviour — `addWeight` upserts on
  `(user_id, logged_on)` per `0009`.
- **Rapid flick past the end:** `valueAtScroll` clamps the index, so overscroll cannot
  produce an out-of-range value.
- **jsdom:** does not implement scroll physics; the component test drives keyboard and
  typed input, and the scroll math is covered by the pure module (see Testing).

## Testing (Vitest)

- `weightWheel.test.ts`
  - `buildWheelValues`: ascending order; exact 0.1 spacing with no float drift
    (`78.1`, not `78.10000000000001`); span honoured; clamped at `min`/`max`;
    anchor near a bound produces a truncated but non-empty list.
  - `indexOfNearest`: exact hit; nearest when between two values; clamps below/above
    the list.
  - `valueAtScroll`: `scrollTop = 0` -> first value; mid-row rounding to the nearest
    row; negative and overscroll offsets clamp to the ends.
  - `scrollTopForIndex`: round-trips with `indexOfNearest`.
  - `stepValue`: ±0.1 and ±1 stepping; clamps at both ends.
- `WeightWheel.test.tsx` (@testing-library/react, matching `I18nProvider.test.tsx`)
  - Exposes `role="spinbutton"` with correct `aria-valuetext` for the initial value.
  - ArrowUp/ArrowDown change the reported value by 0.1 and call `onChange`.
  - Home/End move to the window bounds.
  - The "type it" toggle reveals a number input, and committing a value calls
    `onChange` with the clamped number.
- No repo/DB tests: this feature adds no query. `addWeight` is unchanged.

## i18n

New flat keys in `src/i18n/strings/en.json`: `metrics.typeValue` ("Type value"),
`metrics.useWheel` ("Use wheel"), `metrics.weightWheelLabel` ("Weight, scroll to
adjust"), `metrics.logTodaysWeight` (dashboard quick-log button). Unit labels keep
coming from `useUnits().weightLabel`.

## Out of scope

- The parked next-set suggestion bug (tracked separately; the user will supply a
  screenshot).
- Wheel pickers for any other numeric field (reps, weight-lifted, height).
- Haptic feedback on tick.
- Backfilling or editing past weigh-ins.
- Any schema change.
