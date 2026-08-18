import { StrictMode, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { WeightWheel } from './WeightWheel'
import en from '../i18n/strings/en.json'
import {
  buildWheelValues, indexOfNearest, scrollTopForIndex, ROW_HEIGHT,
} from '../features/profile/weightWheel'

function Harness({ initial = 78.4 }: { initial?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <WeightWheel value={value} onChange={setValue} unitLabel="kg" label="Weight" />
      <output data-testid="committed">{value}</output>
    </>
  )
}

/** Controlled like `Harness`, but reports every commit so a test can assert on the ones that
 * do *not* happen (a bound reached twice must not fire onChange again). */
function SpyHarness({ initial, onCommit }: { initial: number; onCommit: (v: number) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <WeightWheel value={value} onChange={(v) => { onCommit(v); setValue(v) }} unitLabel="kg" label="Weight" />
      <output data-testid="committed">{value}</output>
    </>
  )
}

/** jsdom runs no layout, so the drum never really snaps — but `scrollTop` is a plain writable
 * property and React attaches `onScroll` to the node itself, so the handler's *logic* can be
 * driven by hand. That is what these helpers do; the physics still needs a real device. */
function scroll(wheel: HTMLElement, to: number, anchor: number) {
  wheel.scrollTop = scrollTopForIndex(indexOfNearest(buildWheelValues(anchor), to), ROW_HEIGHT)
  fireEvent.scroll(wheel)
}

/** Let the handler's requestAnimationFrame (and the state update it causes) run. */
async function flushFrames() {
  await act(async () => {
    await new Promise<void>((r) => { requestAnimationFrame(() => { requestAnimationFrame(() => r()) }) })
  })
}

function wheelOf() {
  return screen.getByRole('spinbutton', { name: 'Weight' })
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

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

describe('WeightWheel scroll handling', () => {
  it('commits the value under the selection band after a scroll', async () => {
    render(<Harness initial={78} />)
    const wheel = wheelOf()
    scroll(wheel, 79.6, 78)
    await flushFrames()
    expect(screen.getByTestId('committed')).toHaveTextContent('79.6')
    expect(wheel).toHaveAttribute('aria-valuetext', '79.6 kg')
  })

  it('coalesces a burst of scroll events into one commit, at the latest position', async () => {
    const onChange = vi.fn()
    render(<WeightWheel value={78} onChange={onChange} unitLabel="kg" label="Weight" />)
    const wheel = wheelOf()
    scroll(wheel, 78.5, 78)
    scroll(wheel, 79, 78)
    scroll(wheel, 79.4, 78)
    await flushFrames()
    expect(onChange.mock.calls).toEqual([[79.4]])
  })

  it('does not commit a value from the old window when a re-anchor beats the frame', () => {
    // The frame runs *after* the scroll event, so it must read the window from a ref: with the
    // event's own closure, a re-anchor in between turns the (already re-positioned) offset into
    // a weight from a list that is no longer rendered. The drum has to be sitting off-centre
    // for that to show — otherwise the stale offset and the stale window cancel out.
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const runFrames = () => { const queued = frames.splice(0); act(() => { queued.forEach((f) => { f(0) }) }) }
    const onChange = vi.fn()
    const props = { onChange, unitLabel: 'kg', label: 'Weight' }
    const { rerender } = render(<WeightWheel value={78} {...props} />)
    const wheel = wheelOf()

    scroll(wheel, 90, 78) // flick up the window, well away from centre
    runFrames()
    expect(onChange).toHaveBeenLastCalledWith(90)
    rerender(<WeightWheel value={90} {...props} />) // parent accepts; anchor still 78
    onChange.mockClear()

    scroll(wheel, 90.1, 78) // another flick — its frame has not run yet
    rerender(<WeightWheel value={120} {...props} />) // meanwhile the value jumps out of window
    expect(wheel).toHaveAttribute('aria-valuemin', '105') // re-anchored around 120
    runFrames()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cancels a pending frame on unmount and stays inert if it runs anyway', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length })
    const cancel = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancel)
    const onChange = vi.fn()
    const { unmount } = render(<WeightWheel value={78} onChange={onChange} unitLabel="kg" label="Weight" />)
    const wheel = wheelOf()
    scroll(wheel, 63, 78) // bottom of the window: a commit here would be unmistakable
    expect(frames.length).toBeGreaterThan(0)
    unmount()
    expect(cancel).toHaveBeenCalled()
    act(() => { frames.forEach((f) => { f(0) }) })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('drops a pending frame when the typed fallback replaces the drum', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const onChange = vi.fn()
    render(<WeightWheel value={78} onChange={onChange} unitLabel="kg" label="Weight" />)
    scroll(wheelOf(), 63, 78)
    fireEvent.click(screen.getByRole('button', { name: 'Type value' }))
    act(() => { frames.forEach((f) => { f(0) }) })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the drum where the user left it when the parent accepts the scroll', async () => {
    // The sync effect must not animate the list to a position it is already holding.
    render(<Harness initial={78} />)
    const wheel = wheelOf()
    const scrollTo = vi.fn()
    Object.defineProperty(wheel, 'scrollTo', { value: scrollTo, configurable: true })
    scroll(wheel, 79.6, 78)
    await flushFrames()
    expect(scrollTo).not.toHaveBeenCalled()
  })
})

describe('WeightWheel drum/value coherence', () => {
  it('centres the drum on the value at mount', () => {
    render(<Harness initial={78.4} />)
    expect(wheelOf().scrollTop).toBe(scrollTopForIndex(indexOfNearest(buildWheelValues(78.4), 78.4), ROW_HEIGHT))
  })

  it('re-centres after a typed-fallback round trip that did not change the value', async () => {
    // The typed fallback unmounts the scroller, so the guard cannot key on the anchor alone:
    // an unchanged value gives an unchanged anchor and a fresh div sitting at scrollTop 0.
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    const expected = scrollTopForIndex(indexOfNearest(buildWheelValues(78), 78), ROW_HEIGHT)
    expect(wheelOf().scrollTop).toBe(expected)
    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.click(screen.getByRole('button', { name: 'Use wheel' }))
    expect(wheelOf().scrollTop).toBe(expected)
  })

  it('animates the drum to each keyboard step, without re-anchoring', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    const wheel = wheelOf()
    const scrollTo = vi.fn()
    Object.defineProperty(wheel, 'scrollTo', { value: scrollTo, configurable: true })
    wheel.focus()
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}')
    const values = buildWheelValues(78)
    expect(scrollTo).toHaveBeenCalledTimes(3)
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: scrollTopForIndex(indexOfNearest(values, 78.3), ROW_HEIGHT),
      behavior: 'smooth',
    })
    expect(wheel).toHaveAttribute('aria-valuemin', '63') // window unchanged by stepping
  })

  it('jumps instead of gliding under prefers-reduced-motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }))
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    const wheel = wheelOf()
    const scrollTo = vi.fn()
    Object.defineProperty(wheel, 'scrollTo', { value: scrollTo, configurable: true })
    wheel.focus()
    await user.keyboard('{ArrowUp}')
    expect(scrollTo).toHaveBeenCalledWith({ top: expect.any(Number), behavior: 'auto' })
  })

  it('leaves the drum alone when the parent rejects the change', async () => {
    // A controlled component cannot force a scroll container to agree with it, so the drum
    // follows the *committed* prop: never a number the app did not keep.
    const user = userEvent.setup()
    render(<WeightWheel value={78} onChange={() => {}} unitLabel="kg" label="Weight" />)
    const wheel = wheelOf()
    const scrollTo = vi.fn()
    Object.defineProperty(wheel, 'scrollTo', { value: scrollTo, configurable: true })
    wheel.focus()
    await user.keyboard('{ArrowUp}{PageUp}')
    expect(scrollTo).not.toHaveBeenCalled()
    expect(wheel).toHaveAttribute('aria-valuenow', '78')
    expect(wheel.scrollTop).toBe(scrollTopForIndex(indexOfNearest(buildWheelValues(78), 78), ROW_HEIGHT))
  })
})

describe('WeightWheel geometry', () => {
  // jsdom cannot check that a row lands under the band, but it can check the structure the
  // arithmetic assumes — and `scrollTopForIndex`'s own doc warns that changing the spacer count
  // breaks it with nothing failing. These assertions are that missing alarm.
  it('renders two-row spacers around the rows in a five-row viewport', () => {
    const { container } = render(<Harness initial={78} />)
    const wheel = wheelOf()
    const children = Array.from(wheel.children) as HTMLElement[]
    const rows = children.slice(1, -1)
    expect(children).toHaveLength(buildWheelValues(78).length + 2)
    expect(rows).toHaveLength(301)
    expect(children[0].style.height).toBe(`${ROW_HEIGHT * 2}px`)
    expect(children[children.length - 1].style.height).toBe(`${ROW_HEIGHT * 2}px`)
    expect(wheel.className).toContain('h-[200px]') // five ROW_HEIGHT rows
    expect(rows[0].className).toContain('h-10') // == ROW_HEIGHT
    expect(rows[0]).toHaveTextContent('63.0')
    expect(rows[150]).toHaveTextContent('78.0')
    expect(rows.every((r) => r.getAttribute('aria-hidden') === 'true')).toBe(true)
    // The selection band sits over rows 80–120px, i.e. the centred row.
    expect(container.querySelector('.top-20.h-10')).not.toBeNull()
  })

  it('fades the rows with a mask, not with a gradient in some surface colour', () => {
    // A painted fade has to name the background it sits on, and the wheel sits on two of them
    // (`#1b2030` in the modal, `#0f1115` on Edit Stats and onboarding), so one of the pages was
    // always going to get a grey haze. jsdom renders none of this — all this test can do is stop
    // a surface-coupled fade from coming back.
    const { container } = render(<Harness initial={78} />)
    const wheel = wheelOf()
    expect(wheel.className).toContain('[mask-image:linear-gradient(')
    expect(wheel.className).toContain('[-webkit-mask-image:linear-gradient(') // iOS PWA
    // Opaque across the band (40% of 200px = 80px, 60% = 120px), transparent at both edges.
    expect(wheel.className).toContain('transparent_0,black_40%,black_60%,transparent_100%')
    expect(container.querySelector('.bg-gradient-to-b')).toBeNull()
    expect(container.querySelector('.bg-gradient-to-t')).toBeNull()
    expect(container.innerHTML).not.toContain('1b2030')
    expect(container.innerHTML).not.toContain('from-white')
  })

  it('keeps the band and the focus ring outside the masked element', () => {
    // Both would otherwise be painted through the mask, which fades out precisely the top and
    // bottom edges that make them legible.
    render(<Harness initial={78} />)
    const wheel = wheelOf()
    expect(wheel.querySelector('.top-20')).toBeNull() // band is a sibling, not a child
    expect(wheel.parentElement?.className).toContain('focus-within:ring-2')
  })
})

describe('WeightWheel under StrictMode', () => {
  // The app mounts inside StrictMode, which double-invokes both the render (so the
  // render-phase re-anchor runs twice) and the mount effects (so the positioning guard is
  // asked twice about the same element).
  it('still centres, steps, and re-centres after a round trip', async () => {
    const user = userEvent.setup()
    render(<StrictMode><Harness initial={78} /></StrictMode>)
    const centred = (v: number) => scrollTopForIndex(indexOfNearest(buildWheelValues(v), v), ROW_HEIGHT)
    expect(wheelOf().scrollTop).toBe(centred(78))
    wheelOf().focus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByTestId('committed')).toHaveTextContent('78.1')
    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.click(screen.getByRole('button', { name: 'Use wheel' }))
    expect(wheelOf().scrollTop).toBe(centred(78.1))
  })
})

describe('WeightWheel keyboard edges', () => {
  it('stops at the window bounds instead of wrapping', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    wheelOf().focus()
    await user.keyboard('{End}{ArrowUp}{PageUp}')
    expect(screen.getByTestId('committed')).toHaveTextContent('93')
    await user.keyboard('{Home}{ArrowDown}{PageDown}')
    expect(screen.getByTestId('committed')).toHaveTextContent('63')
  })

  it('does not re-commit the same value once the drum sits at a bound', async () => {
    const user = userEvent.setup()
    const seen: number[] = []
    render(<SpyHarness initial={78} onCommit={(v) => { seen.push(v) }} />)
    wheelOf().focus()
    await user.keyboard('{End}')
    expect(seen).toEqual([93])
    seen.length = 0
    await user.keyboard('{ArrowUp}{PageUp}{End}')
    expect(seen).toEqual([])
  })

  it('ignores modified arrows so browser and screen-reader shortcuts still work', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    wheelOf().focus()
    await user.keyboard('{Meta>}{ArrowUp}{/Meta}')
    await user.keyboard('{Control>}{Home}{/Control}')
    expect(screen.getByTestId('committed')).toHaveTextContent('78')
  })
})

describe('WeightWheel out-of-window props', () => {
  it('re-anchors around a value the parent supplies from outside the window', () => {
    const props = { onChange: () => {}, unitLabel: 'kg', label: 'Weight' }
    const { rerender } = render(<WeightWheel value={78} {...props} />)
    rerender(<WeightWheel value={140} {...props} />)
    const wheel = wheelOf()
    expect(wheel).toHaveAttribute('aria-valuenow', '140')
    expect(wheel).toHaveAttribute('aria-valuemin', '125')
    expect(wheel).toHaveAttribute('aria-valuemax', '155')
    expect(wheel.scrollTop).toBe(scrollTopForIndex(indexOfNearest(buildWheelValues(140), 140), ROW_HEIGHT))
  })

  it('settles rather than looping on a value outside the global bounds', () => {
    render(<WeightWheel value={500} onChange={() => {}} unitLabel="kg" label="Weight" />)
    const wheel = wheelOf()
    // No window can contain 500, so the wheel shows the top of the range rather than
    // re-anchoring forever or quietly overwriting the parent's state.
    expect(wheel).toHaveAttribute('aria-valuemin', '385')
    expect(wheel).toHaveAttribute('aria-valuemax', '400')
  })

  it('never announces a value outside its own reported bounds', () => {
    // aria-valuenow outside [valuemin, valuemax] is an invalid spinbutton, and announcing a
    // number the drum cannot show tells a screen-reader user something no sighted user sees.
    for (const value of [500, -5, Number.NaN, 78.4]) {
      const { unmount } = render(<WeightWheel value={value} onChange={() => {}} unitLabel="kg" label="Weight" />)
      const wheel = wheelOf()
      const now = Number(wheel.getAttribute('aria-valuenow'))
      const min = Number(wheel.getAttribute('aria-valuemin'))
      const max = Number(wheel.getAttribute('aria-valuemax'))
      expect(now).toBeGreaterThanOrEqual(min)
      expect(now).toBeLessThanOrEqual(max)
      expect(wheel).toHaveAttribute('aria-valuetext', `${now.toFixed(1)} kg`)
      unmount()
    }
  })

  it('announces the drum, not the prop, for an out-of-bounds value', () => {
    render(<WeightWheel value={500} onChange={() => {}} unitLabel="kg" label="Weight" />)
    expect(wheelOf()).toHaveAttribute('aria-valuenow', '400')
    expect(wheelOf()).toHaveAttribute('aria-valuetext', '400.0 kg')
  })

  it('substitutes an in-bounds value for a non-finite prop instead of announcing NaN', () => {
    render(<WeightWheel value={Number.NaN} onChange={() => {}} unitLabel="kg" label="Weight" />)
    const wheel = wheelOf()
    expect(wheel).toHaveAttribute('aria-valuenow', '20')
    expect(wheel).toHaveAttribute('aria-valuetext', '20.0 kg')
  })
})

describe('WeightWheel naming and description', () => {
  it('keeps the instruction out of the name and in the description', () => {
    // As part of the name, "Scroll to adjust" is re-read on every single value change.
    render(<Harness initial={78} />)
    const wheel = wheelOf()
    expect(wheel).toHaveAccessibleName('Weight')
    expect(wheel).toHaveAccessibleDescription('Scroll to adjust')
  })

  it('ships a label with no instruction in it', () => {
    // The harness passes `label` directly, so nothing else here exercises the string the three
    // real call sites hand in. This is the guard against the instruction creeping back into the
    // accessible name.
    expect(en['metrics.weightWheelLabel']).toBe('Weight')
    expect(en['metrics.weightWheelHint']).toBe('Scroll to adjust')
  })

  it('shows the hint on screen, since the scrollbar is hidden', () => {
    render(<Harness initial={78} />)
    expect(screen.getByText('Scroll to adjust')).toBeVisible()
  })

  it('gives two wheels on one page distinct hint ids', () => {
    render(
      <>
        <WeightWheel value={78} onChange={() => {}} unitLabel="kg" label="Weight" />
        <WeightWheel value={60} onChange={() => {}} unitLabel="kg" label="Weight" />
      </>,
    )
    const [a, b] = screen.getAllByRole('spinbutton', { name: 'Weight' })
    const idA = a.getAttribute('aria-describedby')
    const idB = b.getAttribute('aria-describedby')
    expect(idA).not.toBe(idB)
    expect(document.getElementById(idA!)).not.toBeNull()
    expect(document.getElementById(idB!)).not.toBeNull()
    expect(a).toHaveAccessibleDescription('Scroll to adjust')
    expect(b).toHaveAccessibleDescription('Scroll to adjust')
  })
})

describe('WeightWheel announcement formatting', () => {
  it('announces one decimal, matching the rows, even for an integer value', () => {
    render(<Harness initial={63} />)
    expect(wheelOf()).toHaveAttribute('aria-valuetext', '63.0 kg')
  })

  it('announces the drum row for an off-grid value while reporting the stored number', () => {
    render(<Harness initial={78.44} />)
    const wheel = wheelOf()
    expect(wheel).toHaveAttribute('aria-valuetext', '78.4 kg') // the row it sits on
    expect(wheel).toHaveAttribute('aria-valuenow', '78.44') // what the app actually holds
  })
})

describe('WeightWheel fallback round trips', () => {
  it('does not drift or re-clamp across two wheel/type round trips', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    for (const typed of ['120', '121.5']) {
      await user.click(screen.getByRole('button', { name: 'Type value' }))
      const input = screen.getByLabelText('Weight')
      await user.clear(input)
      await user.type(input, typed)
      await user.click(screen.getByRole('button', { name: 'Use wheel' }))
      const wheel = wheelOf()
      expect(wheel).toHaveAttribute('aria-valuenow', typed)
      expect(wheel).toHaveAttribute('aria-valuemin', String(Number(typed) - 15))
      expect(wheel).toHaveAttribute('aria-valuemax', String(Number(typed) + 15))
      expect(wheel.scrollTop).toBe(
        scrollTopForIndex(indexOfNearest(buildWheelValues(Number(typed)), Number(typed)), ROW_HEIGHT),
      )
    }
    expect(screen.getByTestId('committed')).toHaveTextContent('121.5')
  })

  it('opens the typed field on a digit and keeps the digit that opened it', async () => {
    // role="spinbutton" advertises an editable field; typing at it must not silently do nothing.
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    wheelOf().focus()
    await user.keyboard('8')
    const input = screen.getByLabelText('Weight')
    expect(document.activeElement).toBe(input)
    expect(input).toHaveValue('8') // the keystroke that opened the field is not lost
    await user.keyboard('0')
    expect(input).toHaveValue('80')
    await user.tab()
    expect(screen.getByTestId('committed')).toHaveTextContent('80')
  })

  it('does not seed a later typed edit with a digit from an earlier one', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    wheelOf().focus()
    await user.keyboard('80')
    await user.tab() // commits 80, focus lands on "Use wheel"
    await user.click(screen.getByRole('button', { name: 'Use wheel' }))
    await user.click(screen.getByRole('button', { name: 'Type value' }))
    expect(screen.getByLabelText('Weight')).toHaveValue('80') // the committed value, not "8"
  })

  it('opens the typed field on a decimal point too', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    wheelOf().focus()
    await user.keyboard('.')
    expect(screen.getByLabelText('Weight')).toHaveValue('.')
  })

  it('leaves other keys to the browser rather than opening the field', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    wheelOf().focus()
    await user.keyboard('{Tab}k-{Backspace}')
    expect(screen.getByRole('spinbutton', { name: 'Weight' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('carries focus across the toggle instead of dropping it on the document', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    expect(document.activeElement).toBe(document.body) // nothing stolen on mount
    await user.click(screen.getByRole('button', { name: 'Type value' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Weight'))
    await user.click(screen.getByRole('button', { name: 'Use wheel' }))
    expect(document.activeElement).toBe(wheelOf())
  })

  it('does not steal focus on mount under StrictMode', () => {
    render(<StrictMode><Harness initial={78} /></StrictMode>)
    expect(document.activeElement).toBe(document.body)
  })

  it('clamps typed input to the global bounds, not the window', async () => {
    const user = userEvent.setup()
    render(<Harness initial={78} />)
    await user.click(screen.getByRole('button', { name: 'Type value' }))
    const input = screen.getByLabelText('Weight')
    await user.clear(input)
    await user.type(input, '900')
    await user.tab()
    expect(screen.getByTestId('committed')).toHaveTextContent('400')
    await user.click(screen.getByRole('button', { name: 'Use wheel' }))
    expect(wheelOf()).toHaveAttribute('aria-valuenow', '400')
  })
})

/** A second harness rather than a prop on `Harness`: leaving `Harness` without `autoFocus` at
 *  all is what keeps "does not steal focus on mount" (above, and its StrictMode twin) testing
 *  the prop *absent* rather than merely passed as undefined. */
function FocusHarness({ initial = 78, autoFocus }: { initial?: number; autoFocus?: boolean }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <WeightWheel value={value} onChange={setValue} unitLabel="kg" label="Weight" autoFocus={autoFocus} />
      <output data-testid="committed">{value}</output>
    </>
  )
}

describe('WeightWheel autoFocus', () => {
  it('focuses the drum on mount when asked', () => {
    render(<FocusHarness autoFocus />)
    expect(document.activeElement).toBe(wheelOf())
  })

  it('leaves focus alone when autoFocus is explicitly false', () => {
    render(<FocusHarness autoFocus={false} />)
    expect(document.activeElement).toBe(document.body)
  })

  it('focuses exactly once under StrictMode, which replays the mount effect', () => {
    const focused: EventTarget[] = []
    const spy = (e: Event) => { if (e.target) focused.push(e.target) }
    document.addEventListener('focusin', spy)
    try {
      render(<StrictMode><FocusHarness autoFocus /></StrictMode>)
      expect(document.activeElement).toBe(wheelOf())
      expect(focused.filter((el) => el === wheelOf())).toHaveLength(1)
    } finally {
      document.removeEventListener('focusin', spy)
    }
  })

  it('centres the drum before taking focus, so focus cannot disturb the position', () => {
    // The mount focus is a passive effect and the positioning is a layout one, so `scrollTop` is
    // already committed when focus lands. jsdom cannot reproduce a real scroll-into-view, so this
    // pins the ordering rather than the browser behaviour `preventScroll` guards against.
    render(<StrictMode><FocusHarness initial={78} autoFocus /></StrictMode>)
    const centred = scrollTopForIndex(indexOfNearest(buildWheelValues(78), 78), ROW_HEIGHT)
    expect(wheelOf().scrollTop).toBe(centred)
    expect(document.activeElement).toBe(wheelOf())
  })

  it('still hands focus across the typed-fallback toggle in both directions', async () => {
    const user = userEvent.setup()
    render(<FocusHarness initial={78} autoFocus />)
    await user.click(screen.getByRole('button', { name: 'Type value' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Weight'))
    await user.click(screen.getByRole('button', { name: 'Use wheel' }))
    expect(document.activeElement).toBe(wheelOf())
  })

  it('does not reclaim focus the user has moved elsewhere', async () => {
    // The mount focus fires once and never again; a later re-render must not drag the user back
    // to the drum from whatever they tabbed to.
    const user = userEvent.setup()
    render(<FocusHarness initial={78} autoFocus />)
    await user.keyboard('{ArrowUp}') // commits 78.1, re-rendering the component
    const type = screen.getByRole('button', { name: 'Type value' })
    type.focus()
    await user.keyboard('{Tab}')
    expect(document.activeElement).not.toBe(wheelOf())
  })
})
