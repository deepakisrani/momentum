import { useState, type FormEvent } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { WeightWheel } from './WeightWheel'
import { rebaseWeightForUnits } from '../features/profile/rebaseForUnits'
import { fromInputWeight, weightUnitLabel } from '../features/profile/unitsFormat'
import type { Units } from '../domain/types'

/** The wheel inside a `<form>`, which `WeightWheel.test.tsx` never covers: its first two call
 * sites were modals with plain buttons, and Edit Stats and onboarding are submitted forms.
 *
 * The interaction that needs pinning is Enter. `NumberField` commits on Enter *without*
 * `preventDefault` — deliberately, so a typed value that never passed its live-commit gate is
 * not lost — which means the keystroke both commits and triggers implicit form submission.
 *
 * Be clear about what these tests do and do not establish. They pin an **outcome**: that a value
 * typed into the fallback is what the form submits. They would catch `commit()` disappearing from
 * `onKeyDown`, or its clamp changing, or a call site reading the weight from somewhere staler
 * than the state the wheel commits to.
 *
 * They cannot fail on **event ordering**, and must not be read as evidence about it. There is no
 * real implicit submission here: `user-event`'s keyboard plugin synthesizes a click on the submit
 * button *after* the keydown dispatch returns, with an `act()` boundary in between, so React has
 * flushed long before the submit is even dispatched. In a browser the same code is safe for a
 * different reason — React treats `keydown` as a discrete-priority event and flushes it
 * synchronously before the default action runs, and the form's `onSubmit` prop is re-read at
 * dispatch time. That reasoning is sound today but it is React's internal scheduling, not a
 * guarantee these pages hold: if `keydown` ever left discrete priority, this form would submit
 * `50` for a typed `500` and every test in this file would still pass. Real Safari is the only
 * place that can confirm it. */
function FormHarness({ initial, onSave }: { initial: number; onSave: (v: number) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSave(value) }}>
      <WeightWheel value={value} onChange={setValue} unitLabel="kg" label="Weight" />
      <button type="submit">Save</button>
      <output data-testid="committed">{value}</output>
    </form>
  )
}

describe('WeightWheel inside a form', () => {
  it('submits the value typed in the fallback, not the one the wheel opened with', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<FormHarness initial={70} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: 'Type Value' }))
    const input = screen.getByLabelText('Weight')
    await user.clear(input)
    await user.type(input, '82.5{Enter}')
    expect(onSave.mock.calls).toEqual([[82.5]])
  })

  it('submits a clamped out-of-range entry, not the stale in-range prefix', async () => {
    // "500" never passes NumberField's live-commit gate (it is above the wheel's max), so at the
    // moment Enter is pressed the committed value is still 50, from typing "50". The outcome
    // asserted here is that the form sees 400, the clamped typed value — a regression that
    // removed Enter's `commit()` would store 50 kg for a typed 500. (This says nothing about
    // *when* the commit lands relative to the submit; see the note above.)
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<FormHarness initial={70} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: 'Type Value' }))
    const input = screen.getByLabelText('Weight')
    await user.clear(input)
    await user.type(input, '500{Enter}')
    expect(screen.getByTestId('committed')).toHaveTextContent('400')
    expect(onSave.mock.calls).toEqual([[400]])
  })

  it('submits a value seeded by a digit typed at the drum', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<FormHarness initial={70} onSave={onSave} />)
    screen.getByRole('spinbutton', { name: 'Weight' }).focus()
    await user.keyboard('8') // opens the fallback, carrying the digit over
    await user.type(screen.getByLabelText('Weight'), '2.5{Enter}')
    expect(onSave.mock.calls).toEqual([[82.5]])
  })

  it('does not submit the form from the drum itself', async () => {
    // The drum is a focusable div, so Enter has no implicit submission to trigger, and the
    // stepping keys all call preventDefault. A stray submit here would save mid-scroll. Weak
    // evidence, in fairness: `user-event` only synthesizes a submit for Enter on a form control,
    // so it agrees with the browser here rather than independently confirming it.
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<FormHarness initial={70} onSave={onSave} />)
    screen.getByRole('spinbutton', { name: 'Weight' }).focus()
    await user.keyboard('{Enter}{ArrowUp}{ArrowDown}{PageUp}{PageDown}{Home}{End}')
    expect(onSave).not.toHaveBeenCalled()
  })
})

/** Onboarding's shape: a units `<select>` beside the wheel, rebasing on change. */
function UnitsHarness({ onSave }: { onSave: (kg: number) => void }) {
  const [units, setUnits] = useState<Units>('metric')
  const [weight, setWeight] = useState(70)
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSave(fromInputWeight(weight, units)) }}>
      <label>
        Units
        <select
          value={units}
          onChange={(e) => {
            const next = e.target.value as Units
            setWeight((w) => rebaseWeightForUnits(w, units, next))
            setUnits(next)
          }}
        >
          <option value="metric">Metric</option>
          <option value="imperial">Imperial</option>
        </select>
      </label>
      <WeightWheel value={weight} onChange={setWeight} unitLabel={weightUnitLabel(units)} label="Weight" />
      <button type="submit">Save</button>
    </form>
  )
}

describe('WeightWheel beside a units toggle', () => {
  it('stores the kg the user chose after switching units', async () => {
    // The ordering this pins is a DOM fact, not arithmetic: leaving the typed field blurs it,
    // so the entry commits *before* the select's change event rebases it. Commit the other way
    // round and the rebase would convert a stale weight and throw away the typed one.
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<UnitsHarness onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: 'Type Value' }))
    const input = screen.getByLabelText('Weight')
    await user.clear(input)
    await user.type(input, '82.5')
    await user.selectOptions(screen.getByLabelText('Units'), 'imperial')
    expect(input).toHaveValue('181.9') // 82.5 kg, restated in pounds
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toBeCloseTo(82.5, 1)
  })

  it('re-announces the drum in the new unit after a switch', async () => {
    const user = userEvent.setup()
    render(<UnitsHarness onSave={vi.fn()} />)
    const before = screen.getByRole('spinbutton', { name: 'Weight' })
    expect(before).toHaveAttribute('aria-valuetext', '70.0 kg')
    await user.selectOptions(screen.getByLabelText('Units'), 'imperial')
    const after = screen.getByRole('spinbutton', { name: 'Weight' })
    expect(after).toHaveAttribute('aria-valuetext', '154.3 lb')
    // The new value is outside the old ±15 window, so the drum must have re-anchored around it
    // — otherwise there is no row for it and the reading and the drum disagree.
    expect(Number(after.getAttribute('aria-valuemin'))).toBeLessThanOrEqual(154.3)
    expect(Number(after.getAttribute('aria-valuemax'))).toBeGreaterThanOrEqual(154.3)
  })
})
