import {
  useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent,
} from 'react'
import { useT } from '../i18n/I18nProvider'
import { NumberField } from './NumberField'
import {
  buildWheelValues, clampWeight, indexOfNearest, scrollTopForIndex, stepValue,
  valueAtScroll, ROW_HEIGHT, WHEEL_MAX, WHEEL_MIN,
} from '../features/profile/weightWheel'

/** Rows an ArrowUp/Down (0.1) and a PageUp/Down (1.0) move. Spinbutton convention: "up"
 * increases the value, and values ascend with the index, so "up" is a *positive* delta. */
const KEY_ROWS: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }

/** A key that should open the typed fallback rather than step the drum. */
const DIGIT = /^[\d.]$/

/** Animate the drum to a row. Reduced motion gets a jump instead of a glide, and a missing
 * `scrollTo` (jsdom) is a no-op rather than a crash — the value is committed either way. */
function scrollToIndex(el: HTMLElement, index: number) {
  if (typeof el.scrollTo !== 'function') return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollTo({ top: scrollTopForIndex(index, ROW_HEIGHT), behavior: reduce ? 'auto' : 'smooth' })
}

/** Drum picker for a weight in display units, snapping to 0.1.
 *
 * Native CSS scroll-snap provides the physics — no animation loop, no gesture handling — and
 * the component reads the snapped row back out of `scrollTop`. Values are windowed around an
 * anchor (see weightWheel.ts) because 0.1 steps across the full 20–400 range would be ~2,200
 * DOM rows. The typed fallback is both the accessible path and the way to reach a value
 * outside that window.
 *
 * Geometry invariant: a 200px (five-row) viewport, 40px rows (`h-10`) and two-row (80px)
 * spacers are what make `scrollTopForIndex(n) === n * ROW_HEIGHT` centre row `n`, what put the
 * selection band at 80–120px (`top-20 h-10`), and what put the mask's opaque stops at 40%–60%
 * (= those same 80–120px). All four move together; changing one silently mis-centres the wheel
 * or fades the selected row, and no test here can catch it (jsdom has no layout).
 *
 * The rows fade out through a `mask-image`, not a gradient overlay in the surface colour: the
 * wheel is used on the modal card (`#1b2030`) and on two full pages (`#0f1115`), and a painted
 * fade can only match one of them — on the others it shows as a grey haze. A mask has no
 * colour to get wrong, so it is right on every surface, including ones added later.
 *
 * `onChange` is not de-duplicated across renders: the "did the value actually change" test reads
 * a ref that only advances when the parent re-renders with a new `value`, so a parent that holds
 * `value` fixed will see the same number again on every flick and keypress. Harmless for a
 * `useState` setter, which is what every call site does; worth knowing before putting a network
 * write in `onChange`. A programmatic scroll also commits the rows it glides *through*, not only
 * the row it lands on. */
export function WeightWheel({ value, onChange, unitLabel, label, autoFocus = false }: {
  value: number
  onChange: (v: number) => void
  unitLabel: string
  label: string
  /** Focus the drum once, on mount. For a caller that opens *onto* the wheel — a modal, whose
   * trigger button is destroyed as it opens, leaving focus on the document body and a keyboard
   * user tabbing in from the top. Off by default, and it must stay that way: on a full page the
   * wheel is one field among several, and grabbing focus there would scroll the page to it and
   * skip the fields above. */
  autoFocus?: boolean
}) {
  const t = useT()
  const [anchor, setAnchor] = useState(() => clampWeight(value))
  const [typing, setTyping] = useState(false)
  /** A digit typed at the drum, handed to the field it opened as that field's initial text. */
  const [pendingChar, setPendingChar] = useState<string | null>(null)
  // Derived, so two wheels on one page (or one remounted) cannot describe each other.
  const hintId = `weight-wheel-hint-${useId()}`

  // A non-finite prop (a parent's Number('') gone NaN) has no row and cannot be announced:
  // fall back to the same in-bounds value weightWheel.ts uses for its own empty cases rather
  // than rendering aria-valuenow="NaN" and a "NaN kg" announcement.
  const current = Number.isFinite(value) ? value : clampWeight(value)
  const values = useMemo(() => buildWheelValues(anchor), [anchor])
  // Defaults are unreachable for a clamped, finite anchor (buildWheelValues always returns a
  // non-empty in-bounds list there); they exist so a future opts change cannot make the
  // bounds `undefined`, which React would drop from the ARIA attributes entirely.
  const first = values[0] ?? WHEEL_MIN
  const last = values[values.length - 1] ?? WHEEL_MAX
  // What the drum can actually show, and therefore the only number worth announcing. It differs
  // from `current` only for a prop outside the *global* bounds, which no window can contain: a
  // spinbutton whose valuenow sits outside valuemin/valuemax is invalid ARIA, and announcing
  // "500.0 kg" while the drum reads 400.0 tells a screen-reader user something no sighted user
  // can see. The committed value is untouched — the parent's 500 stays the parent's 500.
  const announced = clampWeight(current)

  // A value from outside the current window — a parent loading a different weigh-in, or the
  // typed fallback — would otherwise leave the wheel with no row to scroll to. Re-anchoring
  // during render (rather than in an effect) means React discards this pass and re-runs with the
  // new window, so the DOM never commits the mismatch and no stray scroll animation fires.
  // `announced` doubles as the wanted anchor here: it is `current` pulled inside the global
  // bounds, which is exactly where a window that could hold it would be centred. Comparing it
  // against the current anchor is also the termination guard — a value outside the global bounds
  // fits in no window at all, and without that test this would re-render forever.
  if ((current < first || current > last) && announced !== anchor) setAnchor(announced)

  const listRef = useRef<HTMLDivElement | null>(null)
  const frame = useRef<number | null>(null)
  const positionedFor = useRef<{ anchor: number; el: HTMLDivElement } | null>(null)
  /** The value the drum's current scroll offset represents, as far as we know. */
  const scrolledTo = useRef<number | null>(null)
  /** Newest committed window, for the rAF callback below. */
  const latest = useRef({ values, current })
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const focusedFor = useRef<boolean | null>(null)
  /** Whether the mount autofocus has already happened, so nothing can focus the drum a second
   * time — including StrictMode's replayed mount effect. */
  const autoFocused = useRef(false)

  // ---------------------------------------------------------------------------------------
  // The three effects below are `useLayoutEffect` *as a set*, and that is a contract, not a
  // preference. They are the only writers of the drum's position and of the refs that describe
  // it (`latest`, `scrolledTo`, `scrollTop`), and the only reader outside them is the rAF frame
  // in `handleScroll` — which, running after paint, can be scheduled *between* React's layout
  // and passive phases. Split these across the two phases and that frame observes half of an
  // update: a freshly positioned `scrollTop` against a stale `latest` window, which is exactly
  // the "commits a weight from the old list" bug the ref was introduced to prevent. Today the
  // pairing is what keeps them consistent — no test can catch a future split, because `act()`
  // flushes both phases in one synchronous block and a frame can never land in the middle.
  // So: move them together or not at all.
  // ---------------------------------------------------------------------------------------

  useLayoutEffect(() => { latest.current = { values, current } }, [values, current])

  // Position the drum once per (anchor, mounted element), so an ordinary re-render mid-flick
  // never yanks the list back. Layout phase, not passive: React paints between the commit and
  // the passive flush, so a passive assignment shows the user one frame of the *unscrolled*
  // list — with two-row spacers that means `anchor - 15` under the band (63.0 on a 78 kg
  // wheel) flashing before it jumps. jsdom never paints, so no test here can see that either.
  //
  // Of the guard's parts, `typing` in the dependency list is the load-bearing one: the typed
  // fallback unmounts the scroller, and without that dependency this effect would not re-run
  // when the wheel comes back, leaving a fresh div at scrollTop 0 while aria-valuenow reported
  // the real weight. Remembering the element (not just the anchor) and clearing the record
  // while unmounted are belt and braces: they cover a remount this effect happens to re-run
  // for anyway, and keep a detached node from being pinned alive. Both are deliberately kept,
  // and neither is what makes the round trip work.
  useLayoutEffect(() => {
    const el = typing ? null : listRef.current
    if (!el) { positionedFor.current = null; return }
    const done = positionedFor.current
    if (done && done.anchor === anchor && done.el === el) return
    positionedFor.current = { anchor, el }
    el.scrollTop = scrollTopForIndex(indexOfNearest(values, current), ROW_HEIGHT)
    scrolledTo.current = current
  }, [typing, anchor, values, current])

  // Keep the drum in step with the committed value when the change did not come from the user's
  // own scrolling: keyboard steps, and external updates. Those two, and *not* the scroll path —
  // a parent that rejects a scrolled value causes no re-render, so this never runs and the drum
  // stays under the finger with aria-valuenow disagreeing until something else moves it. The
  // keyboard path is covered because there the drum only follows a value the parent accepted.
  // (`scrolledTo` is what stops this from fighting a flick still in progress.)
  useLayoutEffect(() => {
    const el = typing ? null : listRef.current
    if (!el || scrolledTo.current === current) return
    if (current < first || current > last) return // out of window: the re-anchor above owns it
    scrolledTo.current = current
    scrollToIndex(el, indexOfNearest(values, current))
  }, [typing, current, values, first, last])

  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current) }, [])

  // Opt-in mount focus, kept deliberately apart from the toggle effect below rather than folded
  // into it. That effect exists to *move* focus when the fallback swaps one control for another,
  // and its `previous == null` branch is a guarantee — it never fires on mount, which is what
  // every full-page call site depends on. Teaching it about mount would put that guarantee and
  // this opt-in in the same condition, where a later edit to either can break the other.
  //
  // Passive rather than layout, and that is the deliberate half of the choice. The three layout
  // effects above are the only writers of the drum's position and are documented as a set that
  // moves together; focus is not a position concern and does not join them. Running after paint
  // also means `scrollTop` is already committed by the time focus lands, so focus can never race
  // the centring — and `preventScroll` means it does not scroll anything in the first place
  // (focusing a scroller makes ancestors reveal it, which inside a modal would fight the layout).
  // Belt and braces on purpose: the ordering alone is enough, and so is `preventScroll` alone.
  // Nothing paints differently for the one frame before focus arrives, so unlike the `scrollTop`
  // assignment there is no flash of a wrong state to avoid by going earlier.
  //
  // The ref is not just about StrictMode's double invocation (`focus()` on the already-focused
  // element is a spec no-op anyway): it is what stops a re-run of this effect from yanking focus
  // back off whatever the user has since moved it to.
  useEffect(() => {
    if (!autoFocus || autoFocused.current) return
    autoFocused.current = true
    listRef.current?.focus({ preventScroll: true })
  }, [autoFocus])

  // Toggling the fallback destroys whichever control had focus, which would otherwise drop a
  // keyboard user back to the top of the document mid-edit. Move focus to the replacement — a
  // seeded field is already editing when this focus lands, so NumberField leaves its text alone.
  // Comparing against the last value this effect acted on is what keeps it from stealing focus
  // on mount, and makes StrictMode's replayed mount effect a no-op; the `null` start is belt and
  // braces for an initial `typing` of true, which cannot happen today (the `previous === typing`
  // test already covers mount).
  useEffect(() => {
    const previous = focusedFor.current
    focusedFor.current = typing
    if (previous == null || previous === typing) return
    if (typing) fieldRef.current?.querySelector('input')?.focus()
    else listRef.current?.focus()
  }, [typing])

  function handleScroll() {
    if (frame.current != null) return // coalesce a burst of scroll events into one frame
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const el = listRef.current
      if (!el) return // unmounted, or swapped for the typed fallback, since the event fired
      // Read the window from the ref, not this closure: the frame runs after the event, and a
      // re-anchor in between would leave `values` describing a list that is no longer rendered
      // — turning a scroll offset into a weight from the *old* window.
      const { values: vs, current: cur } = latest.current
      const next = valueAtScroll(el.scrollTop, ROW_HEIGHT, vs)
      // The drum is already where the user put it; record that before committing so the sync
      // effect above does not animate it to a position it is holding.
      scrolledTo.current = next
      if (next !== cur) onChange(next)
    })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Modified arrows belong to the browser and to screen readers (VoiceOver navigates with
    // Ctrl+Option+arrow); stepping the weight on those would hijack them.
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const delta: number | undefined = KEY_ROWS[e.key]
    let next: number | null = null
    if (delta != null) next = stepValue(values, indexOfNearest(values, current), delta)
    else if (e.key === 'Home') next = first
    else if (e.key === 'End') next = last
    if (next == null) {
      // `role="spinbutton"` advertises an editable numeric field, so typing a digit at it is a
      // keyboard user's first instinct. Honour that: open the fallback and carry the digit over,
      // which makes typing "just start typing" instead of "first find the button".
      if (e.key.length === 1 && DIGIT.test(e.key)) {
        e.preventDefault()
        setPendingChar(e.key) // NumberField takes it as its initial text — see its `seed` prop
        setTyping(true)
      }
      return
    }
    // Native arrow/page scrolling would move the drum a second time, and upward — the
    // opposite of what a spinbutton's ArrowUp means here.
    e.preventDefault()
    if (next !== current) onChange(next)
  }

  // ~301 rows, rebuilt only when the window moves. Every 0.1 of a flick commits a new value
  // and re-renders this component, and re-creating 301 elements (and 301 toFixed calls) per
  // scroll tick is exactly the kind of work that makes a drum stutter on a phone; identical
  // element references let React bail out of the row subtree instead.
  const rows = useMemo(() => values.map((v) => (
    <div key={v} className="flex h-10 snap-center items-center justify-center text-lg tabular-nums" aria-hidden="true">
      {v.toFixed(1)}
    </div>
  )), [values])

  const toggle = 'w-full text-xs font-semibold text-brand-700 dark:text-brand-400'

  if (typing) {
    return (
      <div className="space-y-2" ref={fieldRef}>
        <NumberField
          value={current}
          onChange={onChange}
          decimal
          // The global bounds, never the window's: clamping typed input to the ±15 window
          // would defeat the only escape hatch out of it.
          min={WHEEL_MIN}
          max={WHEEL_MAX}
          ariaLabel={label}
          // Only set when a digit at the drum opened this field, and read only at mount.
          seed={pendingChar ?? undefined}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-2xl font-bold tabular-nums text-slate-900 dark:border-slate-700 dark:bg-[#0f1115] dark:text-white"
        />
        {/* Clearing the pending digit on the way out matters: left set, it would seed the *next*
            typed edit with a keystroke from this one. */}
        <button type="button" onClick={() => { setAnchor(clampWeight(current)); setPendingChar(null); setTyping(false) }} className={toggle}>
          {t('metrics.useWheel')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* The focus ring lives out here, on the *unmasked* wrapper: a ring drawn on the scroller
          itself is painted through the mask, which fades away its top and bottom edges exactly
          where they are needed. `focus-within` because the scroller is the only focusable
          thing inside it. */}
      <div className="relative rounded-lg focus-within:ring-2 focus-within:ring-brand-500">
        <div
          ref={listRef}
          role="spinbutton"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={first}
          aria-valuemax={last}
          aria-valuenow={announced}
          aria-valuetext={`${announced.toFixed(1)} ${unitLabel}`}
          aria-describedby={hintId}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          // The two mask declarations fade the rows either side of the selected one: transparent
          // at the top edge, fully opaque across 40%–60% (= the 80–120px band), transparent again
          // at the bottom. No surface colour appears anywhere, which is the whole point. Both are
          // spelled out in full, and never interpolated: Tailwind only generates arbitrary
          // properties it can find as literal text in the source. The -webkit- copy is not
          // optional either — this ships as an iOS PWA, and Safari before 15.4 has only the
          // prefixed property.
          className="h-[200px] snap-y snap-mandatory overflow-y-auto overscroll-y-contain rounded-lg focus:outline-none [mask-image:linear-gradient(to_bottom,transparent_0,black_40%,black_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_40%,black_60%,transparent_100%)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Two-row spacers: without them the first and last values could never reach the
              centre band. See the geometry invariant above. */}
          <div style={{ height: ROW_HEIGHT * 2 }} />
          {rows}
          <div style={{ height: ROW_HEIGHT * 2 }} />
        </div>
        {/* The selection band is a border, not a fade, and it stays outside the masked scroller
            so the mask cannot fade the band itself away. */}
        <div className="pointer-events-none absolute inset-x-0 top-20 h-10 rounded-md border-y-2 border-brand-600" />
      </div>
      <div className="text-center text-sm text-slate-500 dark:text-slate-400">{unitLabel}</div>
      {/* The hint is described-by, not part of the name: as the name it would be re-read in full
          on every value change. Visible as well as announced, because hiding the scrollbar
          leaves a sighted user no clue that the region scrolls at all. */}
      <div id={hintId} className="text-center text-xs text-slate-400 dark:text-slate-500">
        {t('metrics.weightWheelHint')}
      </div>
      <button type="button" onClick={() => setTyping(true)} className={toggle}>
        {t('metrics.typeValue')}
      </button>
    </div>
  )
}
