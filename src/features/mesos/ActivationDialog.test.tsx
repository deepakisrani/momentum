import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ActivationDialog } from './ActivationDialog'

// Props-only: no router, no auth, no Supabase. Nothing to mock.
function setup(busy = false) {
  const onFreshRun = vi.fn()
  const onResume = vi.fn()
  const onCancel = vi.fn()
  const utils = render(
    <ActivationDialog
      mesoName="Push/Pull"
      busy={busy}
      onFreshRun={onFreshRun}
      onResume={onResume}
      onCancel={onCancel}
    />
  )
  return { onFreshRun, onResume, onCancel, ...utils }
}

const fresh = () => screen.getByRole('button', { name: 'Start Fresh Run' })
const resume = () => screen.getByRole('button', { name: 'Resume Previous Run' })
const cancel = () => screen.getByRole('button', { name: 'Cancel' })

beforeEach(() => { document.body.style.overflow = '' })
afterEach(() => { vi.restoreAllMocks() })

describe('ActivationDialog', () => {
  it('names the meso being activated', () => {
    setup()
    expect(screen.getByText('Push/Pull')).toBeInTheDocument()
  })

  it('spells out what a fresh run resets, since neither button is undoable in place', () => {
    setup()
    // Resolved from en.json, not echoed back as the key — a missing string would read
    // "mesos.activateBody" on screen and this is the only guard against that.
    expect(screen.getByText(/deload count/)).toBeInTheDocument()
  })

  it('offers all three outcomes', () => {
    setup()
    expect(fresh()).toBeInTheDocument()
    expect(resume()).toBeInTheDocument()
    expect(cancel()).toBeInTheDocument()
  })

  it('every button is type=button, so a caller inside a form cannot submit it', () => {
    setup()
    for (const btn of [fresh(), resume(), cancel()]) expect(btn).toHaveAttribute('type', 'button')
  })

  it('fires exactly one callback per choice', async () => {
    const user = userEvent.setup()
    const { onFreshRun, onResume, onCancel } = setup()
    await user.click(fresh())
    expect(onFreshRun).toHaveBeenCalledTimes(1)
    expect(onResume).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('resume is a distinct outcome from fresh run', async () => {
    const user = userEvent.setup()
    const { onFreshRun, onResume, onCancel } = setup()
    await user.click(resume())
    expect(onResume).toHaveBeenCalledTimes(1)
    expect(onFreshRun).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancel fires only cancel', async () => {
    const user = userEvent.setup()
    const { onFreshRun, onResume, onCancel } = setup()
    await user.click(cancel())
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onFreshRun).not.toHaveBeenCalled()
    expect(onResume).not.toHaveBeenCalled()
  })

  it('disables every choice while busy, so a double tap cannot activate twice', async () => {
    const user = userEvent.setup()
    const { onFreshRun, onResume, onCancel } = setup(true)
    for (const btn of [fresh(), resume(), cancel()]) {
      expect(btn).toBeDisabled()
      await user.click(btn)
    }
    expect(onFreshRun).not.toHaveBeenCalled()
    expect(onResume).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('locks page scroll while open and restores it on close', () => {
    const { unmount } = setup()
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('ActivationDialog — backdrop dismissal', () => {
  const backdropOf = (container: HTMLElement) => container.querySelector('.fixed.inset-0') as HTMLElement

  it('cancels on a backdrop click but not on a click inside the card', async () => {
    const user = userEvent.setup()
    const { onCancel, container } = setup()
    await user.click(screen.getByText('Push/Pull'))
    expect(onCancel).not.toHaveBeenCalled()

    await user.click(backdropOf(container))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not cancel when a drag that began inside the card ends on the backdrop', () => {
    const { onCancel, container } = setup()
    // Such a drag dispatches `click` at the two nodes' common ancestor — the backdrop — so it
    // never traverses the card and the card's stopPropagation cannot see it. userEvent.click
    // cannot reproduce it: it puts mousedown and click on the same node.
    fireEvent.mouseDown(screen.getByText('Push/Pull'))
    fireEvent.click(backdropOf(container))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('ignores a backdrop click while busy, matching the disabled buttons', async () => {
    const user = userEvent.setup()
    const { onCancel, container } = setup(true)
    await user.click(backdropOf(container))
    expect(onCancel).not.toHaveBeenCalled()
  })
})
