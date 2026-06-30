import { useEffect } from 'react'

/** Locks page scroll while a modal/overlay is mounted, restoring it on unmount. */
export function useBodyScrollLock(): void {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
}
