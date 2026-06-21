import { useSyncExternalStore } from 'react'
import { getDeferred, subscribe, promptInstall } from './installPrompt'

function isStandaloneNow(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIOSNow(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export interface InstallState {
  /** A native install prompt is available (Chrome/Edge/Android). */
  canPrompt: boolean
  /** iOS Safari: no programmatic install, show manual instructions instead. */
  isIOS: boolean
  /** Already running as an installed app — hide install affordances. */
  isStandalone: boolean
  promptInstall: () => Promise<boolean>
}

export function useInstall(): InstallState {
  const deferred = useSyncExternalStore(subscribe, getDeferred, () => null)
  return {
    canPrompt: deferred !== null,
    isIOS: isIOSNow(),
    isStandalone: isStandaloneNow(),
    promptInstall,
  }
}
