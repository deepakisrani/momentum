import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NumberField } from './NumberField'

/** Controlled harness — mirrors how pages use the field (numeric state upstream). */
function Harness({ initial = 8, min, max, decimal, seed }: { initial?: number; min?: number; max?: number; decimal?: boolean; seed?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <NumberField value={value} onChange={setValue} min={min} max={max} decimal={decimal} seed={seed} ariaLabel="reps" />
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

/** Lets a test change the value prop from outside without touching (and so blurring) the field. */
let setExternal: ((n: number) => void) | undefined
function ExternalHarness() {
  const [value, setValue] = useState(8)
  setExternal = setValue
  return (
    <>
      <NumberField value={value} onChange={setValue} ariaLabel="reps" />
      <output data-testid="committed">{value}</output>
    </>
  )
}

describe('NumberField vs. the outside world', () => {
  it('does not let an external value change overwrite the text mid-edit', async () => {
    const user = userEvent.setup()
    render(<ExternalHarness />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '1')

    act(() => setExternal!(50))

    // The keystroke in progress wins the field; the new prop is still committed upstream.
    expect(input).toHaveValue('1')
    expect(screen.getByTestId('committed')).toHaveTextContent('50')

    // On blur the edit the user actually made is what lands.
    await user.tab()
    expect(input).toHaveValue('1')
    expect(screen.getByTestId('committed')).toHaveTextContent('1')
  })

  it('picks up an external value change once the field is not being edited', async () => {
    const user = userEvent.setup()
    render(<ExternalHarness />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '3')
    await user.tab()
    expect(input).toHaveValue('3')

    act(() => setExternal!(50))
    expect(input).toHaveValue('50')

    // Re-focusing and leaving without typing must not resurrect the earlier "3".
    await user.click(input)
    await user.tab()
    expect(input).toHaveValue('50')
    expect(screen.getByTestId('committed')).toHaveTextContent('50')
  })

  it('does not replay text left over from an Enter commit when the field is later blurred', async () => {
    const user = userEvent.setup()
    render(<ExternalHarness />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '3{Enter}')
    expect(screen.getByTestId('committed')).toHaveTextContent(/^3$/)

    // Enter ends the edit but fires no focus event, so `text` still holds "3" here.
    act(() => setExternal!(50))
    expect(input).toHaveValue('50')

    await user.tab()
    expect(input).toHaveValue('50')
    expect(screen.getByTestId('committed')).toHaveTextContent(/^50$/)
  })

  it('shows what the parent actually committed, even when the parent rewrites it', async () => {
    const user = userEvent.setup()
    function Capping() {
      const [value, setValue] = useState(5)
      return (
        <>
          <NumberField value={value} onChange={(n) => setValue(Math.min(n, 10))} ariaLabel="reps" />
          <output data-testid="committed">{value}</output>
        </>
      )
    }
    render(<Capping />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '50')
    await user.tab()
    // The field must never claim 50 after blur when 10 is what upstream holds.
    expect(input).toHaveValue('10')
    expect(screen.getByTestId('committed')).toHaveTextContent('10')
  })
})

describe('NumberField decimal parsing', () => {
  it('tolerates a trailing point while typing and normalizes it on blur', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} decimal />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '78.')
    expect(input).toHaveValue('78.')
    expect(screen.getByTestId('committed')).toHaveTextContent('78')
    await user.tab()
    expect(input).toHaveValue('78')
  })

  it('accepts a leading point and normalizes it on blur', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} decimal />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '.5')
    expect(screen.getByTestId('committed')).toHaveTextContent('0.5')
    await user.tab()
    expect(input).toHaveValue('0.5')
  })

  it('refuses a second decimal point', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} decimal />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '1.2.3')
    expect(input).toHaveValue('1.23')
  })

  it('reverts a lone decimal point on blur without committing anything', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} decimal />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '.')
    expect(input).toHaveValue('.')
    expect(screen.getByTestId('committed')).toHaveTextContent('78')
    await user.tab()
    expect(input).toHaveValue('78')
  })
})

describe('NumberField never emits a bad number', () => {
  it('only ever calls onChange with a finite, in-range value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField value={8} onChange={onChange} min={1} max={20} decimal ariaLabel="reps" />)
    const input = screen.getByLabelText('reps')
    for (const junk of ['.', '..', '1.2.3', 'abc', '-5', '1e5', '0', '99', '9'.repeat(400)]) {
      await user.clear(input)
      await user.type(input, junk)
      await user.tab()
    }
    await user.clear(input) // and the empty field, whose Number('') === 0 started all this
    await user.tab()
    for (const [n] of onChange.mock.calls) {
      expect(Number.isFinite(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(20)
    }
    expect(onChange).toHaveBeenCalled()
  })

  it('does not commit a below-min first digit while the number is still being typed', async () => {
    const user = userEvent.setup()
    render(<Harness initial={8} min={1} max={20} />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '0')
    // "0" is a legitimate prefix of "08"; it is shown but not committed, so upstream never
    // sees a value its own min forbids.
    expect(input).toHaveValue('0')
    expect(screen.getByTestId('committed')).toHaveTextContent(/^8$/)
    await user.type(input, '8')
    expect(screen.getByTestId('committed')).toHaveTextContent(/^8$/)
    await user.tab()
    expect(input).toHaveValue('8')
  })

  it('ignores non-finite min/max instead of committing NaN', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField value={8} onChange={onChange} min={Number.NaN} max={Number.NaN} ariaLabel="reps" />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '12')
    await user.tab()
    expect(onChange).toHaveBeenCalledWith(12)
    for (const [n] of onChange.mock.calls) expect(Number.isFinite(n)).toBe(true)
  })

  it('commits on Enter, which fires no blur and would otherwise submit a stale value', async () => {
    const user = userEvent.setup()
    render(<Harness initial={70} min={20} max={400} decimal />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '500')
    // toHaveTextContent is a substring match, so pin it — '500' must not pass as '50'.
    expect(screen.getByTestId('committed')).toHaveTextContent(/^50$/) // 500 is out of range, held back
    await user.type(input, '{Enter}')
    expect(screen.getByTestId('committed')).toHaveTextContent('400')
    expect(input).toHaveValue('400')
  })

  it('rejects a minus sign (no call site takes a negative)', async () => {
    const user = userEvent.setup()
    render(<Harness initial={8} decimal />)
    const input = screen.getByLabelText('reps')
    await user.clear(input)
    await user.type(input, '-5')
    expect(input).toHaveValue('5')
  })
})

describe('NumberField with an out-of-shape prop', () => {
  it('shows a fractional value verbatim in an integer field and does not silently round it', async () => {
    const user = userEvent.setup()
    render(<Harness initial={8.5} />)
    const input = screen.getByLabelText('reps')
    expect(input).toHaveValue('8.5')
    await user.click(input)
    await user.tab()
    expect(input).toHaveValue('8.5')
    expect(screen.getByTestId('committed')).toHaveTextContent('8.5')
  })

  it('still lets the user delete their way out of an out-of-shape value', async () => {
    const user = userEvent.setup()
    render(<Harness initial={8.5} />)
    const input = screen.getByLabelText('reps')
    await user.click(input)
    // Backspacing through "8." — text the integer shape rejects — has to keep working, or the
    // field is frozen and select-all-delete is the only way out.
    await user.type(input, '{Backspace}')
    expect(input).toHaveValue('8.')
    await user.type(input, '{Backspace}9')
    await user.tab()
    expect(input).toHaveValue('89')
    expect(screen.getByTestId('committed')).toHaveTextContent('89')
  })

  it('allows a mid-string deletion out of an out-of-shape value', async () => {
    const user = userEvent.setup()
    render(<Harness initial={82.5} />)
    const input = screen.getByLabelText('reps')
    // Backspacing the '2' out of "82.5" leaves "8.5" — a subsequence of what was shown, but
    // not a substring of it, and still out of shape for an integer field.
    await user.type(input, '{Backspace}', { initialSelectionStart: 2, initialSelectionEnd: 2 })
    expect(input).toHaveValue('8.5')
    expect(screen.getByTestId('committed')).toHaveTextContent(/^8\.5$/)
  })

  it('renders a non-finite value prop as an empty field, not "NaN"', () => {
    render(<NumberField value={Number.NaN} onChange={() => {}} ariaLabel="reps" />)
    expect(screen.getByLabelText('reps')).toHaveValue('')
  })

  it('rejects a non-numeric paste that replaces the whole value', async () => {
    const user = userEvent.setup()
    render(<Harness initial={123} />)
    const input = screen.getByLabelText('reps')
    await user.tripleClick(input)
    // Shorter than what it replaces, so the deletion escape hatch must not wave it through:
    // this is why `deleting` tests for a subsequence and not merely for a shorter string.
    await user.paste('a')
    expect(input).toHaveValue('123')
    expect(screen.getByTestId('committed')).toHaveTextContent('123')
  })
})

describe('NumberField with a seeded edit', () => {
  // `seed` exists so a parent that captured the first keystroke before this field existed can
  // hand it over — WeightWheel's spinbutton swaps itself for this input when a digit is typed
  // at it. The alternative was writing that character into the DOM from outside, through
  // React's internal value tracking, which would break silently on an upgrade.
  it('starts the edit with the seeded text rather than the committed value', () => {
    render(<NumberField value={78} onChange={() => {}} ariaLabel="reps" seed="8" />)
    expect(screen.getByLabelText('reps')).toHaveValue('8')
  })

  it('keeps the seed when the parent focuses the field straight afterwards', () => {
    // This is the sequence WeightWheel produces: mount seeded, then focus. An unconditional
    // reseed in onFocus would replace the seed with the committed value here.
    render(<NumberField value={78} onChange={() => {}} ariaLabel="reps" seed="8" />)
    const input = screen.getByLabelText('reps')
    act(() => { input.focus() })
    expect(document.activeElement).toBe(input)
    expect(input).toHaveValue('8')
  })

  it('ignores a later seed instead of overwriting what is being typed', async () => {
    const user = userEvent.setup()
    const props = { value: 78, onChange: () => {}, ariaLabel: 'reps' }
    const { rerender } = render(<NumberField {...props} seed="8" />)
    const input = screen.getByLabelText('reps')
    await user.type(input, '0')
    expect(input).toHaveValue('80')
    rerender(<NumberField {...props} seed="5" />)
    expect(input).toHaveValue('80') // initial-only: a prop that could overwrite mid-edit text
    rerender(<NumberField {...props} seed={undefined} />)
    expect(input).toHaveValue('80')
  })

  it('commits seeded text through the ordinary blur path, clamping like anything else', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} min={20} max={400} decimal seed="900" />)
    const input = screen.getByLabelText('reps')
    await user.click(input)
    expect(input).toHaveValue('900') // focus does not wipe it
    await user.tab()
    expect(screen.getByTestId('committed')).toHaveTextContent('400')
  })

  it('is inert when absent, leaving the field showing the committed value', () => {
    render(<NumberField value={78} onChange={() => {}} ariaLabel="reps" />)
    expect(screen.getByLabelText('reps')).toHaveValue('78')
  })
})
