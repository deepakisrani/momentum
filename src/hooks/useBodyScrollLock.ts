import { useEffect } from 'react'

/** How many mounted overlays currently hold the lock, and the `overflow` the page had before
 *  the first of them took it. Module-level rather than per-component because the lock is a
 *  property of the page, not of any one overlay.
 *
 *  Saving and restoring per component only works if overlays unmount in the reverse of the
 *  order they mounted, and nothing in this app enforces that: no modal traps focus, so with a
 *  confirmation open Tab still reaches the page behind it and can mount a second overlay. Both
 *  overlays are `z-50`, so the later DOM sibling paints on top and is the one the user closes
 *  first -- the non-LIFO order. The second overlay would have captured `'hidden'` (the value
 *  the first one had just written) as the value to put back, so closing the first restored
 *  scrolling too early and closing the second re-locked the page indefinitely.
 *
 *  Counting removes the ordering assumption instead of relying on it: the original value is
 *  read once, on the 0 -> 1 transition, and put back once, on the transition back to 0. Which
 *  overlay happens to be first or last stops mattering. */
let holders = 0
let originalOverflow = ''

function acquire(): void {
  // Only the first holder samples the page's own value; a later one would sample the `'hidden'`
  // its predecessor wrote and restore that, which is the bug described above.
  if (holders === 0) {
    originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  holders += 1
}

function release(): void {
  // Clamped rather than allowed to go negative: a stray extra release would otherwise leave the
  // count below zero and make the *next* overlay fail to lock at all.
  holders = Math.max(0, holders - 1)
  if (holders === 0) document.body.style.overflow = originalOverflow
}

/** Locks page scroll while a modal/overlay is mounted, restoring it when the last one unmounts.
 *
 *  Safe under React 18 StrictMode, which in development mounts effects, unmounts them, then
 *  mounts them again: the extra release drops the count to zero and restores the original
 *  value, so the following acquire re-samples that same original value. The pair nets out to a
 *  held lock and a correct value to restore. */
export function useBodyScrollLock(): void {
  useEffect(() => {
    acquire()
    return release
  }, [])
}
