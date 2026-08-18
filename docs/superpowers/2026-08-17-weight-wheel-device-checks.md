# Weight wheel — device verification checklist

**Date:** 2026-08-17
**Branch:** `feat/weight-wheel-and-notes`
**Status:** automated verification complete (324 tests, typecheck, lint at baseline, build); this is what only a human on a real device can confirm.

## Why this list exists

jsdom renders no layout, runs no compositor, and has no scroll physics. For a drum picker that is not a gap at the edges — it is the middle. Nothing in the 324 tests proves that a flick lands on the row under the selection band, that the `mask-image` fade renders as a fade, or that 301 rows scroll smoothly on a phone. The structural tests pin the *numbers* that make the geometry work (200px viewport / 40px rows / 80px spacers / 40–60% mask stops), so a change to one without the others fails loudly — but only real layout proves the centring.

Run this in the **installed PWA on a real device**, not just a desktop browser or the Simulator. Several items are specifically about iOS Safari behaviour that neither reproduces.

---

## Tier 1 — could change the design

These are not polish. A failure here means rethinking something, so check them first.

### 1. Does the drum scroll inside the log-weight modal?

Goals → "Log Weight". Flick the drum up and down.

- **Pass:** it scrolls with normal momentum, snaps to one row, and the page behind never moves.
- **Why it might not:** `useBodyScrollLock` sets `document.body.style.overflow = 'hidden'`, and the modal is `fixed inset-0`. A touch-dragged nested scroller inside a fixed overlay is exactly where iOS Safari has historically broken. The wheel carries `overscroll-y-contain` to stop chaining, which should also prevent the modal dismissing.
- **If it fails:** the whole modal call site needs rethinking — this is the highest-risk unknown in the feature.

### 2. VoiceOver on the drum

Turn on VoiceOver, focus the wheel, try swipe up / swipe down.

- **Pass:** it is announced as an adjustable value ("Weight, 78.4 kg"), the description "Scroll to adjust" is read **once** rather than on every change, and swiping changes the value.
- **Why it might not:** the wheel is `role="spinbutton"` on a scrollable `div`. WebKit's support for adjustable ARIA spinbuttons on plain divs is historically patchy.
- **If it fails:** the typed fallback becomes the *only* iOS accessibility path, and it is currently a small text button. It would need to be more prominent — a design change, which is why this is Tier 1.

### 3. Does the mask render as a fade?

Look at the wheel on any surface, then on Android Chrome if available.

- **Pass:** rows fade out toward the top and bottom; the selected row is fully opaque; the digits are as crisp as the rest of the UI.
- **Why it might not:** a `mask-image` on an `overflow-y: auto` element has a history of disabling composited scrolling and, in some Android WebView builds, of blanking the masked content entirely. Masked layers also composite separately, which can soften text.
- **Note:** "content visible at all" is a separate check from "fade looks right". Check both.

---

## Tier 2 — correctness a test cannot reach

### 4. Flick lands on what gets saved

Flick to a specific number, release, let it settle, save, reopen.

- **Pass:** the saved value is the number that was under the band when you released.
- **Why it matters:** the commit logic relies on the browser firing a final scroll event once snapping settles. If a browser suppresses it, the last 0.1 is silently lost.

### 5. No `63.0` flash when the wheel appears

Open the log-weight modal several times. Also tap "Type value" then "Use wheel".

- **Pass:** the drum shows your current weight immediately, with no flicker of a lower number.
- **Background:** the position is set in a `useLayoutEffect` specifically so it happens before paint. With a passive effect the first painted frame sat at `scrollTop 0`, which puts `63.0` under the band for a 78 kg wheel. Fixed, but unprovable here.

### 6. Enter from the typed fallback, in both forms

On **Edit Stats** and **onboarding**: tap "Type value", type a weight, press Enter/return.

- **Pass:** the form submits and stores the value you typed.
- **The sharp case:** type something above the maximum, e.g. `500` (max is 400). It must store **400**, not `50`. (`50` is the last value that passed the in-range gate while typing, and it is what a broken ordering would submit.)
- **Also check both keypads:** with `inputMode="decimal"`, iOS may show "done" (which blurs — safe) rather than "return" (which submits). Try to get both.
- **Why only a device settles it:** the test for this cannot fail on the ordering it describes — `user-event` synthesizes the submit click after the keydown dispatch returns, with an `act()` boundary between, so React has always flushed by then. Real Safari is the only proof.

### 7. Units toggle with the typed fallback open (onboarding)

Tap "Type value", type a weight, then — without dismissing — tap the Units select and change it.

- **Pass:** the typed value is committed and *then* converted. A typed 80 kg becomes ~176 lb, not 80 lb.
- **Why it might not:** safety rests on the input blurring before the select's change event. iOS opens an inline picker whose focus/blur timing differs from a desktop mousedown.

### 8. Units toggle mid-flick

Flick the drum and, while momentum is still running, change the Units select.

- **Pass:** the value converts correctly; no drift of a few tenths.
- **Why it might not:** the re-anchor writes `scrollTop` imperatively, and residual momentum could fight it.

### 9. Height survives a unit switch (onboarding)

Enter a height in metric (e.g. `175`), switch to imperial, switch back.

- **Pass:** `175` → `68.9` → `175`, and submitting is never blocked by a native validation bubble.
- **Background:** this was a real pre-existing bug — `70` entered as inches then switched to metric stored a **70 cm** adult, moving TDEE by ~1000 kcal/day with no in-app way to repair it. Now fixed.
- **Known and accepted:** switching units with a *half-typed* height (`17` on the way to `175`) converts and clamps it, because `17` is indistinguishable from a deliberate 17. Visible and correctable.

### 10. Dashboard quick-log updates the calorie target

From the dashboard, log a weight materially different from your current one.

- **Pass:** "Target calories" reflects the new weight after the modal closes.
- **Known issue, not a failure:** you will see a **blank screen** for the duration of three network round-trips. `reload()` flips the provider's `loading` flag and `RequireOnboarding` renders nothing while loading, so the whole authenticated subtree unmounts and remounts. Pre-existing behaviour of `reload()` (Goals does it too), deliberately not changed — the fix touches a provider every screen depends on and there are no page-level tests. Tell me how bad it feels and I will take it on properly.

---

## Tier 3 — visual and ergonomic

### 11. Geometry and dark mode on all four surfaces

At a phone viewport (390×844), check the modal (from Goals **and** the dashboard), Edit Stats, and onboarding.

- The selection band lines up with the selected row — including inside the modal's narrow `max-w-xs` card.
- Values snap to one decimal.
- In dark mode the fade reads cleanly on the modal card (`#1b2030`) **and** on the page background (`#0f1115`). The fade is a mask precisely so one colour cannot be wrong on one surface; this confirms it.
- The focus ring (tap the drum) is not clipped by the rounded corners and does not clash with the brand-coloured band.

### 12. Discoverability

Show someone the wheel who has not seen this design.

- **Pass:** they work out it scrolls without being told.
- **Why it is a question:** the scrollbar is hidden on purpose, so the only cues are the fade and the "Scroll to adjust" hint.

### 13. Small screen and large text

iPhone SE viewport, and again at a large accessibility text size. Trigger the error state if you can (airplane mode, then Save).

- **Pass:** everything including the Save button stays reachable. The modal card has no `max-h`/`overflow`, and body scroll is locked, so anything that overflows is unreachable. Arithmetic says ~430px of content in ~619px of space — comfortable, but that is arithmetic, not a screenshot.
- **Onboarding specifically:** the wheel is 200px plus a hint and a toggle in a form that used to have seven compact rows. Confirm the submit button is still reachable without excessive scrolling.

### 14. Performance on the oldest device you have

Flick continuously for ~3 seconds.

- **Pass:** no dropped frames or stutter.
- **Two distinct risks:** the mask forces compositing on some engines, and every 0.1 commits a value which re-renders the *parent* — the whole Edit Stats form, or the onboarding page. The 301 rows are memoised, so sibling re-render cost is the thing to watch.

### 15. Reduced motion, in the installed PWA

Turn on Reduce Motion at the OS level, then use the keyboard/VoiceOver to step the value.

- **Pass:** the drum jumps rather than glides, and the jump is not disorienting.
- **Why the PWA specifically:** standalone mode has had bugs where `matchMedia` does not see the OS setting.

### 16. Backdrop drag-dismiss on the log-weight modal

Open the modal, press on a wheel row, drag out onto the dimmed area, release. Mouse and touch.

- **Pass:** the modal stays open.
- **Background:** a drag starting in the card and ending on the backdrop dispatches `click` at their common ancestor — the backdrop — so the card's `stopPropagation` never sees it and the modal closed, discarding the weigh-in. Fixed and regression-tested before merge; the mouse case was reproduced in a real browser, the touch case is the open question (a touch-drag on a scroller is usually swallowed as a scroll).
- **Same gesture on `ConfirmModal`** (e.g. the delete-note confirmation) still uses the older idiom — pre-existing, worth knowing.

### 17. Onboarding will not accept the default weight unsupervised

Start onboarding fresh. Fill units, sex, DOB and height, but **do not touch the weight wheel**. Submit.

- **Pass:** it refuses, with "Set your weight on the wheel to continue."
- **Then the subtle half:** reload, and this time change only the **units** select before submitting. It must *still* refuse — a unit switch rebases the value and glides the drum, and that must not count as answering the question.
- **Then:** drag the drum (or use "Type value") and submit. It should go through.
- **Why it exists:** a wheel always holds a plausible-looking number, so it removed the one thing that used to stop someone scrolling past the first weight the app ever records.

### 18. The original bug

Meso builder → select a "sets" or "reps" field's contents → delete.

- **Pass:** the field stays **empty**. Type `4` → reads `4`, not `04`.
- This is the leading-zero bug that started this work. Covered by 25 unit tests that simulate real typing, but it is your bug, so it is worth seeing.

---

## What to report back

For anything that fails, the useful details are: which device and OS version, which of the four surfaces, and whether it reproduces in the installed PWA versus mobile Safari. Items 1, 2 and 3 are the ones where a failure means design work rather than a fix.
