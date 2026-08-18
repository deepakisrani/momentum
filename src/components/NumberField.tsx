import { useState } from 'react'

/** Committed number -> the text that represents it. Non-finite props show as empty rather
 * than the string "NaN", which no user typed and nobody can edit back into a number. */
function format(n: number): string {
  return Number.isFinite(n) ? String(n) : ''
}

/** Can `part` be reached from `whole` by deleting characters? A deletion anywhere in the
 * middle leaves a subsequence, not a substring ("82.5" -> "8.5"), so `includes` is too strict. */
function isSubsequence(part: string, whole: string): boolean {
  let i = 0
  for (const ch of whole) if (i < part.length && part[i] === ch) i += 1
  return i === part.length
}

/** Numeric input whose text is local string state while it is being edited.
 *
 * A controlled `<input type="number">` holding *numeric* state cannot behave: clearing it
 * yields Number('') === 0, so react-dom writes "0" back into the field, and the following
 * "01" is only *loosely* equal to 1, so updateWrapper declines to normalize it and the
 * leading zero sticks. A text input plus `inputMode` never enters that code path. */
export function NumberField({
  value, onChange, min, max, decimal = false, className, ariaLabel, seed,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  decimal?: boolean
  className?: string
  ariaLabel?: string
  /**
   * Text the field starts an edit with, for a parent that captured the first keystroke before
   * this field existed — a wheel whose spinbutton swaps itself for this input when a digit is
   * typed at it. Without it that keystroke has nowhere to go: the field would open showing the
   * committed value, and "80" typed at the wheel would arrive here as "780".
   *
   * Initial only. A later `seed` is ignored, because the alternative is a prop that can
   * overwrite half-typed text; the parent controls *when* a seeded edit starts by mounting the
   * field, not by changing this value.
   */
  seed?: string
}) {
  // While `editing`, `text` is authoritative — that is what lets a cleared field stay empty
  // and keeps an external re-render from rewriting the field between two keystrokes. A seeded
  // field is therefore already editing at mount: that is what carries the seed onto the screen.
  const [editing, setEditing] = useState(seed != null)
  const [text, setText] = useState(seed ?? format(value))

  // Derived, never a copy: outside an edit the field *is* the prop, so what is displayed and
  // what is committed cannot drift apart — including when a parent massages or ignores an
  // onChange, where a locally stored "committed text" would lie.
  const shown = editing ? text : format(value)

  // Non-finite bounds are ignored rather than propagated: a caller's `min={Number(x)}` gone
  // NaN would otherwise make every clamp NaN and commit that upstream.
  function clamp(n: number): number {
    const lo = Number.isFinite(min) ? (min as number) : -Infinity
    const hi = Number.isFinite(max) ? (max as number) : Infinity
    return Math.min(hi, Math.max(lo, n))
  }

  /** Text -> number, or null when the text is not a usable number: '', '.', '1e999'. */
  function parse(raw: string): number | null {
    if (raw.trim() === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  function handleInput(raw: string) {
    const shape = decimal ? /^\d*\.?\d*$/ : /^\d*$/
    // Deleting is always allowed, even towards text the shape rejects, so a field seeded
    // with an out-of-shape prop (8.5 in an integer field) stays editable instead of frozen.
    // The subsequence test is what distinguishes a deletion from a *shorter replacement*:
    // pasting "a" over "123" is also shorter, and must still be rejected.
    const deleting = raw.length < shown.length && isSubsequence(raw, shown)
    if (!shape.test(raw) && !deleting) return // reject the keystroke rather than mangle the text
    setEditing(true)
    setText(raw)
    const n = parse(raw)
    // Commit live, but only values already inside [min, max]: min/max exist to keep the
    // caller's state legal, so a half-typed "99" under max=20 waits for blur rather than
    // committing 99, or committing 20 while the field visibly still reads "99".
    if (n != null && n === clamp(n)) onChange(n)
  }

  /** End the edit: normalize and clamp what was typed, or fall back to the committed value. */
  function commit() {
    // Enter commits without ending the focus, and fires no focus event afterwards, so a later
    // blur would re-commit `text` that is by then stale — discarding any external change to
    // `value` in between. Nothing to do: `shown` already tracks the prop.
    if (!editing) return
    setEditing(false)
    const n = parse(text)
    if (n == null) return // nothing usable typed — `shown` falls back to the committed value
    const next = clamp(n)
    if (next !== value) onChange(next)
    // No setText needed: `shown` comes from the prop again, which is what turns "007" into "7".
  }

  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={className}
      aria-label={ariaLabel}
      value={shown}
      // Seed the edit from the prop so a focus-then-blur with no typing cannot commit text
      // left over from an earlier edit. Only when not already editing: an edit in progress has
      // no stale text to replace, and a field that mounted with a `seed` gets focused by its
      // parent immediately afterwards — reseeding there would throw the seed away.
      onFocus={() => { if (!editing) { setEditing(true); setText(format(value)) } }}
      onChange={(e) => handleInput(e.target.value)}
      // Enter never fires blur, so a field inside a <form> would submit whatever last got past
      // the live-commit gate — the last in-range prefix, e.g. 50 for a typed "500" under
      // max=400. Commit here too, without preventDefault so the submit still proceeds.
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
      onBlur={commit}
    />
  )
}
