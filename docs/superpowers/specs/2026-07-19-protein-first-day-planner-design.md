# Protein-first sample-day planner — design

**Date:** 2026-07-19
**Status:** Approved (design)

## Problem

The sample day of eating (`/nutrition`) is scaled to the calorie target only.
Protein falls out wherever it lands, which on a cut leaves all three diet
templates well short of the protein target (the required protein-per-calorie on a
cut is ~90–100 g/1000 kcal; whole-food Indian days deliver ~50–85). Users see a
large negative protein delta on the breakup card and no way for the suggestion to
close it.

We want the engine to treat protein as a first-class target — adding protein-dense
foods (including multiple whey scoops when appropriate) — without collapsing into a
whey-only suggestion.

## Requirements

Confirmed with the user during brainstorming:

1. **Goal-dependent priority.**
   - *Cut:* calories are a **hard ceiling**. Get protein as close to target as
     possible under the cap; a shortfall is acceptable.
   - *Bulk / maintain:* protein is the **target**; calories may flex up.
2. **Active rebalancing on a cut:** when protein is short and the ceiling binds,
   trim low-protein filler (rice, oats, oil) to free calories and spend them on
   protein.
3. **Variety — whey as finisher only:** max out whole-food protein first; use whey
   (capped) only to close the remaining gap.

### Accepted trade-off

Whey is the most calorie-efficient protein (~200 g/1000 kcal vs ~75–190 for whole
foods). Using it last means whole food consumes the calorie budget first, so a very
tight cut can end with a small protein shortfall even after trimming. This is the
deliberate cost of variety and surfaces honestly on the card's protein delta.

## Data model

Each `MealItem` in `sampleDayData.ts` gains:

- `role: 'protein' | 'filler' | 'fixed'`
- `min: number`, `max: number` — hard quantity bounds respected by every phase
  (including phase-1 calorie scaling)
- `finisher?: boolean` — marks whey; only added after whole-food protein is exhausted

Role behavior:

- **protein** — a lean top-up lever; phase 2 *adds* it (up to `max`) to raise protein.
- **filler** — carb/energy foods; phase 2 *trims* them (down to `min`) on a cut to
  free calories for protein.
- **fixed** — staples that scale with calories in phase 1 but the protein optimizer
  leaves alone (adding a third katori of rajma is not how one actually eats).

Backward compatibility: when these fields are absent (e.g. the `scaleDay` test
fixtures), the engine defaults to `role: 'fixed'`, `min: 1`, `max: Infinity`, so
existing `scaleDay` behavior is unchanged.

### Initial tagging (tunable)

| Food | role | min | max | note |
|---|---|---|---|---|
| whey scoop | protein | 0 | 3 | finisher |
| chicken breast (100g) | protein | 1 | 2 | |
| fish fillet (120g) | protein | 1 | 2 | |
| boiled egg | protein | 1 | 4 | per instance |
| egg white | protein | 0 | 8 | |
| soya chunks (30g) | protein | 1 | 3 | |
| tofu (100g) | protein | 1 | 2 | |
| katori dal | fixed | 1 | 2 | |
| katori rajma | fixed | 1 | 2 | |
| bowl curd | fixed | 1 | 2 | |
| katori mixed veg | fixed | 1 | 1 | |
| bowl salad | fixed | 1 | 1 | |
| oats (40g) | filler | 0 | 2 | |
| chapati | filler | 1 | 4 | keep >= 1 |
| katori rice | filler | 0 | 2 | |

## Algorithm

New function:

```
planDay(template, { targetCalories, targetProtein, goal }) -> ScaledDay
```

`targetProtein` is `computeMacros(...).proteinG`, so the protein-per-kg override
(Auto vs custom) flows through untouched. The return shape is the existing
`ScaledDay` (meals + `totalCal` / `totalProtein` / `totalFat` / `totalCarbs`), so
the page and breakup card need no structural change.

### Phase 1 — calorie fit

Today's `scaleDay` logic: scale base quantities by `targetCalories / baseCalories`,
then greedy gap-close, now clamped to each item's `[min, max]`. Extracted into a
shared internal `scaleToCalories(template): Work[]` so both `scaleDay` and `planDay`
use it. Produces a realistic, calorie-accurate starting day.

### Phase 2 — protein reconciliation

Let `C = targetCalories`, `P = targetProtein`. "protein-per-kcal" of an item is
`perUnitProtein / perUnitCal`.

**Cut (hard ceiling `C`):**

1. *Whole-food fill.* Repeat:
   - Add one unit of the `protein` lever (excluding whey) with the highest
     protein-per-kcal that is below its `max` and whose +1 keeps total <= `C`.
   - If nothing fits under the ceiling but protein < `P`, trim one unit of the
     `filler` with the lowest protein-per-kcal that is above its `min`, freeing
     calories; then retry.
   - Stop when protein >= `P`, all whole-food levers are at `max`, or no filler
     remains to trim.
2. *Whey finisher.* While protein < `P` and whey < its cap: add a scoop if it fits
   under `C`; else trim filler to make room, then add. Stop at the cap or when no
   room can be freed.
3. Accept any remaining protein shortfall (shown on the card).

**Bulk / maintain (calories flex up; protein is the target):**

1. *Hit protein* using the same whole-food-then-whey order, without the ceiling
   constraint — add levers until protein >= `P`, letting calories exceed `C`.
2. *Settle calories* toward `C`: if under `C`, add `filler` up to `max` to close the
   gap; if well over, trim filler. Stop within ~50 kcal tolerance.

### Termination

Every move changes state within fixed `[min, max]` bounds. The "trim filler → add
protein" cycle nets protein strictly up each iteration, so it converges. A hard
iteration cap backstops against any unexpected loop.

## Module boundaries

- **`scaleDay.ts`** — extract calorie-fit + greedy-gap into internal
  `scaleToCalories(template): Work[]` (respecting `[min, max]`). `scaleDay` stays
  exported, unchanged in behavior, now a thin wrapper.
- **`planDay.ts`** (new) — exports `planDay`; runs `scaleToCalories` then phase-2
  reconciliation; returns `ScaledDay`.
- **`NutritionPage.tsx`** — replace
  `scaleDay(TEMPLATES[diet], target)` with
  `planDay(TEMPLATES[diet], { targetCalories: target, targetProtein: macros.proteinG, goal: latestGoal.goal })`.
  Downstream (split bar, deltas, meal cards) is unchanged.
- **`sampleDayData.ts`** — add role/min/max/finisher fields per the table.

## Testing (Vitest, `planDay.test.ts`)

- *Cut, reachable:* protein hits target; total <= ceiling.
- *Cut, tight:* protein lands short but as high as caps/ceiling allow; total never
  exceeds ceiling; whey only appears after whole-food levers are maxed.
- *Cut, rebalance:* a case requiring filler trim to fund protein — assert filler
  dropped and protein rose.
- *Bulk:* protein hits target though calories exceed `C`; filler then fills toward `C`.
- *Variety:* result is never whey-only — whole-food protein present before whey.
- *Degenerate:* tiny protein target = no additions; very low calorie target respects
  floors, no negative qty, terminates.
- Existing `scaleDay` tests remain green (backward-compat proof).

## Out of scope

- Moving foods between meals (whey stays where the template places it; a "3 x whey
  scoop" suggestion in one slot is acceptable guidance).
- Per-food nutrition accuracy beyond the current estimated values.
- Any DB/schema change — this is pure client-side computation.
