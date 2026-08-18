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
  /**
   * Must be `1/n` for an integer `n` (e.g. `0.1`, `0.5`, `1`) so `Math.round(1 / step)`
   * lands on a whole scale factor. Outside that contract, the rounding silently swaps
   * in the nearest `1/n` granularity rather than failing loudly — `0.3` doesn't just
   * drift, it rounds to `scale = 3` and produces an actual step of 1/3, not 0.3
   * (`[35, 35.333333333333336, 35.666666666666664, 36]`). The `scale <= 0` guard below
   * only catches `step`s that round `1/step` to zero or negative, which happens for any
   * `step` above ~2 (`step: 3` → `Math.round(1/3) = 0` → rejected, `[]`; `step: 2` →
   * `Math.round(0.5) = 1` → accepted, just not with an actual step of 2). Non-finite or
   * non-positive values (`0`, `-1`, `NaN`) are also rejected and yield `[]` rather than
   * hanging.
   */
  step?: number
  min?: number
  max?: number
}

/** Ascending values around `anchor`. Generated in integer steps then scaled, so the
 * list holds 78.1 rather than 78.10000000000001.
 *
 * `anchor` is clamped into `[min, max]` first (so an anchor beyond a bound, or `NaN`,
 * still yields a truncated but non-empty list, not an inverted/empty range). `step` is
 * validated separately: non-finite or non-positive values return `[]` immediately.
 * Under the default `span`/`min`/`max`, an invalid `step` is the only way this returns
 * `[]` for a numeric anchor. Contradictory or `NaN` `span`/`min`/`max` overrides (e.g.
 * `{ span: -5 }` or `{ min: NaN }`) can also produce `[]` — nothing in this codebase
 * passes those overrides today, so this deliberately doesn't guard against them. */
export function buildWheelValues(anchor: number, opts: WheelOpts = {}): number[] {
  const { span = WHEEL_SPAN, step = WHEEL_STEP, min = WHEEL_MIN, max = WHEEL_MAX } = opts
  const scale = Math.round(1 / step)
  if (!Number.isFinite(scale) || scale <= 0) return []
  const safeAnchor = clampWeight(anchor, min, max)
  const lo = Math.round(Math.max(min, safeAnchor - span) * scale)
  const hi = Math.round(Math.min(max, safeAnchor + span) * scale)
  const out: number[] = []
  for (let n = lo; n <= hi; n += 1) out.push(n / scale)
  return out
}

/** Boundary guard for typed input: clamps into `[min, max]`, and treats a non-finite
 * value (e.g. a cleared/garbled input field) as `min` rather than propagating `NaN`. */
export function clampWeight(value: number, min = WHEEL_MIN, max = WHEEL_MAX): number {
  if (!Number.isFinite(value)) return min
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

/** Scroll offset that puts row `index` exactly at the viewport centre. `index * rowHeight`
 * only works because the component uses exactly two-row spacers in a 200px (five-row)
 * viewport — changing the spacer count breaks this with no failing test here. */
export function scrollTopForIndex(index: number, rowHeight = ROW_HEIGHT): number {
  return index * rowHeight
}

/** Snapped value for a scroll offset. Clamps, so overscroll cannot leave the range.
 * An empty list returns WHEEL_MIN (a valid weight) rather than `0`, since `0` is
 * outside the wheel's bounds and would silently become a stored bodyweight of zero. */
export function valueAtScroll(scrollTop: number, rowHeight: number, values: number[]): number {
  if (values.length === 0) return WHEEL_MIN
  const raw = scrollTop / rowHeight
  // A non-finite raw index (e.g. rowHeight 0) has no meaningful row: fall back to
  // whichever end `raw`'s sign points toward, defaulting to the start for NaN.
  const rounded = Number.isFinite(raw) ? Math.round(raw) : raw > 0 ? values.length - 1 : 0
  const i = Math.min(values.length - 1, Math.max(0, rounded))
  return values[i]
}

/** Keyboard stepping: `delta` rows from `index`, clamped to the list. Same empty-list,
 * non-finite-index, and rounding guards as `valueAtScroll` (a fractional `index` or
 * `delta` must round to a real row, not index the array with e.g. `1.5`), so the two
 * functions agree on every edge case, including which end `Infinity` clamps to. */
export function stepValue(values: number[], index: number, delta: number): number {
  if (values.length === 0) return WHEEL_MIN
  const raw = index + delta
  const rounded = Number.isFinite(raw) ? Math.round(raw) : raw > 0 ? values.length - 1 : 0
  const i = Math.min(values.length - 1, Math.max(0, rounded))
  return values[i]
}

/** Starting weight when the user has never logged one (onboarding). */
export function defaultAnchor(units: Units): number {
  return units === 'imperial' ? 154 : 70
}
