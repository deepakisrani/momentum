import type { Units } from '../../domain/types'
import { fromInputHeight, fromInputWeight, toDisplayHeight, toDisplayWeight } from './unitsFormat'
import { clampWeight } from './weightWheel'

/** Re-expressing a form field when the unit system changes under it.
 *
 * Onboarding asks for units first and body measurements later, so every field it holds is a
 * number in *display* units whose meaning can change mid-form. Leaving such a number alone is
 * never merely cosmetic: the label flips from kg to lb, or cm to in, and submit converts from
 * the new unit, so an untouched 80 or 175 is stored as a completely different body.
 *
 * Both functions below convert *every* value rather than only an untouched default. "Untouched"
 * can only be guessed at — `w === defaultAnchor(units)` also matches a user who deliberately
 * scrolled to exactly 70.0 — and the guess buys nothing, because converting a default is right
 * too (70 kg really is 154.3 lb). Both compose the existing converters in `unitsFormat.ts`
 * rather than doing their own arithmetic, and both clamp into the bounds their field already
 * declares, so a switch can never leave a field holding a value its own validation rejects. */

/** A wheel weight, in display units. See `WeightWheel`, which owns the same bounds.
 *
 * The clamp engages in exactly two places, and neither is a real bodyweight: a metric value
 * above ~181.4 kg (= 400 lb, the imperial ceiling) and an imperial value below ~44.1 lb
 * (= 20 kg, the metric floor). The other two directions are unreachable, because the wheel's
 * 20–400 bounds are unit-agnostic: 20 kg is 44.1 lb, comfortably above the 20 lb floor, and
 * 400 lb is 181.4 kg, far below the 400 kg ceiling. So 30 lb switched to metric becomes 20 kg
 * rather than its raw 13.6, and 44.1 lb converts untouched.
 *
 * Clamping rather than passing the raw conversion through is what keeps the drum honest: at
 * 400.0 kg an unclamped switch would leave the parent holding 881.8 lb while the drum showed
 * its 400.0 ceiling — a display that lies about the weight being saved.
 *
 * A no-op switch returns the value untouched rather than round-tripping it through the
 * rounding, so a caller that re-selects the same unit cannot nudge the weight. */
export function rebaseWeightForUnits(value: number, from: Units, to: Units): number {
  if (from === to) return value
  return clampWeight(toDisplayWeight(fromInputWeight(value, from), to))
}

/** Bounds the onboarding height input declares, per unit system. Exported so the input's
 * `min`/`max` and the clamp below cannot drift apart: if the clamp allowed anything the input
 * rejects, a unit switch could leave the field unsubmittable with no way to see why. */
export const HEIGHT_MIN: Record<Units, number> = { metric: 50, imperial: 20 }
export const HEIGHT_MAX: Record<Units, number> = { metric: 260, imperial: 96 }

/** A typed height, as the **string** its input holds — not a number, because unlike the wheel
 * this field can legitimately be empty or half-typed while the user is still filling the form.
 *
 * An empty, blank or unparseable value is returned byte for byte. A blank field must not become
 * `0` or a default: the user has not answered yet, and answering on their behalf here is how a
 * fabricated height reaches the profile.
 *
 * A *parseable but half-typed* value is not protected, and cannot be: `'17'` on the way to `175`
 * is indistinguishable from a deliberate `17`, so a switch mid-entry converts and clamps it
 * (`'17'` -> `'20'` in imperial, `'1.'` likewise). Accepted: it needs the user to switch units
 * with a partial height on screen, and the result is a visibly wrong number they will correct —
 * not the silent, unrepairable corruption this function exists to remove.
 *
 * Everything else converts. Without this, the units toggle silently corrupted the height, and
 * far more quietly than the weight ever could: the two ranges overlap at 50–96, which as inches
 * is 4'2"–8'0" — the entire human range — so `70` entered as inches and switched to metric
 * passed the input's own validation as 70 cm and stored a 70 cm adult. BMR is linear in height
 * at 6.25 kcal/cm, so that one switch moved TDEE by about a thousand calories a day, across the
 * dashboard, goals and nutrition screens, with no in-app way to fix it (Edit Stats shows height
 * only under 18, and the only other writer wipes the account).
 *
 * The clamp also removes the *other* direction's failure, which was loud rather than silent:
 * 175 cm converted to 68.9 in is inside 20–96, but before this existed the field kept "175",
 * which the imperial input rejected as over its max — a bare native validation bubble on submit
 * and a stale number to retype, on what is the common path (units is question 1, height is
 * question 4). */
export function rebaseHeightForUnits(value: string, from: Units, to: Units): string {
  if (from === to) return value
  // `.trim()` before `Number`, not after a finiteness test: `Number('')` and `Number('  ')` are
  // both 0, so a blank field would otherwise convert to the target's minimum.
  if (value.trim() === '') return value
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  const converted = toDisplayHeight(fromInputHeight(n, from), to)
  return String(Math.min(HEIGHT_MAX[to], Math.max(HEIGHT_MIN[to], converted)))
}
