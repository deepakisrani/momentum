import { StrictMode, useEffect } from 'react'
import { render } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useBodyScrollLock } from './useBodyScrollLock'

// The lock's reference count is module-level state shared by every test in this file, which is
// the point: these tests exist to prove that overlays unwinding in any order net back to zero.
// So nothing here resets that count -- a test that reset it would hide exactly the leak we are
// checking for. Instead every test unmounts what it mounts (and Testing Library's automatic
// cleanup unmounts anything left behind by a failed assertion), and the final test asserts the
// count really did return to zero by re-running the single-overlay case from scratch.

function Overlay() {
  useBodyScrollLock()
  return <div />
}

/** Counts its own effect runs so a StrictMode test can prove the double-invoke happened
 *  rather than passing vacuously on a single invoke. */
let effectRuns = 0
function CountingOverlay() {
  useBodyScrollLock()
  useEffect(() => {
    effectRuns += 1
  }, [])
  return <div />
}

const overflow = () => document.body.style.overflow

// A non-empty baseline on purpose: an implementation that restores a hardcoded '' would pass
// against the jsdom default and fail here.
beforeEach(() => {
  document.body.style.overflow = 'auto'
  effectRuns = 0
})

describe('useBodyScrollLock', () => {
  it('locks on mount and restores the exact prior value on unmount', () => {
    const a = render(<Overlay />)
    expect(overflow()).toBe('hidden')

    a.unmount()
    expect(overflow()).toBe('auto')
  })

  it('stays locked until the last of two overlays unmounts, LIFO', () => {
    const a = render(<Overlay />)
    const b = render(<Overlay />)
    expect(overflow()).toBe('hidden')

    b.unmount()
    expect(overflow()).toBe('hidden')

    a.unmount()
    expect(overflow()).toBe('auto')
  })

  it('stays locked until the last of two overlays unmounts, non-LIFO', () => {
    // The original bug: the second overlay captured 'hidden' as its "previous" value, so
    // unmounting the first restored '' early and unmounting the second re-locked the page for
    // good. Reference counting makes the order irrelevant.
    const a = render(<Overlay />)
    const b = render(<Overlay />)
    expect(overflow()).toBe('hidden')

    a.unmount()
    expect(overflow()).toBe('hidden')

    b.unmount()
    expect(overflow()).toBe('auto')
  })

  it('stays locked through three overlays unmounting in mixed order', () => {
    const a = render(<Overlay />)
    const b = render(<Overlay />)
    const c = render(<Overlay />)
    expect(overflow()).toBe('hidden')

    b.unmount()
    expect(overflow()).toBe('hidden')

    a.unmount()
    expect(overflow()).toBe('hidden')

    c.unmount()
    expect(overflow()).toBe('auto')
  })

  it("holds the lock through StrictMode's dev double-invoke and still restores", () => {
    const a = render(<CountingOverlay />, { wrapper: StrictMode })
    // Guards the test itself: if React were not double-invoking, the rest would prove nothing.
    expect(effectRuns).toBe(2)
    expect(overflow()).toBe('hidden')

    a.unmount()
    expect(overflow()).toBe('auto')
  })

  it('handles two overlays under StrictMode, unmounted non-LIFO', () => {
    const a = render(<Overlay />, { wrapper: StrictMode })
    const b = render(<Overlay />, { wrapper: StrictMode })
    expect(overflow()).toBe('hidden')

    a.unmount()
    expect(overflow()).toBe('hidden')

    b.unmount()
    expect(overflow()).toBe('auto')
  })

  it('does not leak the reference count across tests', () => {
    // Runs last on purpose. Every test above mounted and unmounted overlays against the same
    // module-level count; if any of them left it above zero, the restore below never fires.
    expect(overflow()).toBe('auto')

    const a = render(<Overlay />)
    expect(overflow()).toBe('hidden')

    a.unmount()
    expect(overflow()).toBe('auto')
  })
})
