import type { ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProfileDataContext } from './ProfileDataProvider'
import { LogWeightModal } from './LogWeightModal'
import { todayIso } from './today'
import type { ProfileRow } from '../../data/rows'
import type { Units } from '../../domain/types'

// The modal's only outside call. The other two exports exist because importing
// ProfileDataContext pulls this module in through ProfileDataProvider; leaving them off the
// factory makes that import fail rather than the modal.
vi.mock('../../data/weightRepo', () => ({
  addWeight: vi.fn(),
  getLatestWeight: vi.fn(),
  listWeights: vi.fn(),
}))
const { addWeight } = await import('../../data/weightRepo')
const addWeightMock = vi.mocked(addWeight)

/** `useUnits` reads `units_pref` off the profile, so the unit system is set by the context
 *  the modal renders in — the real conversion code runs either way. `useProfileData`'s
 *  context has a working default (metric), so no provider is needed for the metric case. */
function Units({ units, children }: { units: Units; children: ReactNode }) {
  const profile = { units_pref: units } as ProfileRow
  return (
    <ProfileDataContext.Provider
      value={{ profile, latestWeight: null, latestGoal: null, loading: false, error: null, reload: async () => {} }}
    >
      {children}
    </ProfileDataContext.Provider>
  )
}

beforeEach(() => {
  addWeightMock.mockReset()
  addWeightMock.mockResolvedValue(undefined)
})
afterEach(() => { vi.restoreAllMocks() })

describe('LogWeightModal', () => {
  it('opens the wheel on the weight it was handed', () => {
    render(<LogWeightModal userId="u1" initialWeight={78.4} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByRole('spinbutton', { name: 'Weight' })).toHaveAttribute('aria-valuetext', '78.4 kg')
  })

  it('puts focus on the wheel as it opens', () => {
    // Opening the modal destroys the button that opened it, and no modal in this app traps
    // focus — so without this the drum is reachable only by tabbing in from the page behind.
    render(<LogWeightModal userId="u1" initialWeight={78.4} onClose={() => {}} onSaved={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('spinbutton', { name: 'Weight' }))
  })

  it('stores the untouched value under today\'s date for the given user', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(<LogWeightModal userId="u1" initialWeight={78.4} onClose={() => {}} onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(addWeightMock).toHaveBeenCalledWith('u1', todayIso(), 78.4)
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('stores the value the user scrolled to, not the one it opened on', async () => {
    const user = userEvent.setup()
    render(<LogWeightModal userId="u1" initialWeight={78.4} onClose={() => {}} onSaved={() => {}} />)
    screen.getByRole('spinbutton', { name: 'Weight' }).focus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(addWeightMock).toHaveBeenCalledWith('u1', todayIso(), 78.6)
  })

  it('converts pounds to kilograms for storage', async () => {
    const user = userEvent.setup()
    render(
      <Units units="imperial">
        <LogWeightModal userId="u1" initialWeight={172} onClose={() => {}} onSaved={() => {}} />
      </Units>
    )
    // The wheel is in display units all the way to the addWeight boundary.
    expect(screen.getByRole('spinbutton', { name: 'Weight' })).toHaveAttribute('aria-valuetext', '172.0 lb')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const [, , kg] = addWeightMock.mock.calls[0]
    expect(kg).toBeCloseTo(78.017887, 5) // 172 lb, not 172 kg
  })

  it('surfaces the error copy and stays open when the write fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    const onSaved = vi.fn()
    const onClose = vi.fn()
    addWeightMock.mockRejectedValue(new Error('offline'))
    render(<LogWeightModal userId="u1" initialWeight={78.4} onClose={onClose} onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Something went wrong — please try again.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // Still usable: the wheel is there and Save is out of its busy state, so a retry is
    // one tap away with the value the user already dialled in.
    expect(screen.getByRole('spinbutton', { name: 'Weight' })).toHaveAttribute('aria-valuenow', '78.4')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(logged).toHaveBeenCalledWith('[Metrics] logWeight failed:', expect.any(Error))
  })

  it('writes once even if Save is hit repeatedly before the write lands', async () => {
    const user = userEvent.setup()
    let finish = () => {}
    addWeightMock.mockReturnValue(new Promise<void>((resolve) => { finish = () => resolve() }))
    render(<LogWeightModal userId="u1" initialWeight={78.4} onClose={() => {}} onSaved={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Saving…' }))
    expect(addWeightMock).toHaveBeenCalledTimes(1)
    // Let the write land inside act(), so the busy flag clearing is not an unwrapped update.
    await act(async () => { finish() })
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('closes without writing when the backdrop is clicked, but not the card', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(
      <LogWeightModal userId="u1" initialWeight={78.4} onClose={onClose} onSaved={() => {}} />
    )
    // The heading carries the unit, because the typed fallback shows none of its own.
    await user.click(screen.getByRole('heading', { name: 'Log Weight (kg)' }))
    expect(onClose).not.toHaveBeenCalled() // the card stops the click
    const backdrop = container.firstElementChild
    if (backdrop) await user.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(addWeightMock).not.toHaveBeenCalled()
  })

  it('does not close when a drag that began on the wheel ends on the backdrop', () => {
    const onClose = vi.fn()
    const { container } = render(
      <LogWeightModal userId="u1" initialWeight={78.4} onClose={onClose} onSaved={() => {}} />
    )
    const backdrop = container.firstElementChild as HTMLElement

    // The wheel is a 200px scroller of selectable text filling most of the card, so dragging
    // out of it is easy to do by accident. Such a drag dispatches `click` at the two nodes'
    // common ancestor -- the backdrop -- without ever traversing the card, so the card's
    // stopPropagation never sees it and a target check alone would discard the weigh-in.
    fireEvent.mouseDown(screen.getByRole('spinbutton', { name: /Weight/ }))
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })
})
