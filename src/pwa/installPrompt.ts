/**
 * Captures the browser's `beforeinstallprompt` event and exposes it to React.
 *
 * The event can fire before React mounts, so we attach the listener at module
 * load (import this module early — see main.tsx) and buffer the latest event in
 * a tiny store that components read via `useInstall`.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the (rare) automatic mini-infobar so we control when to prompt.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function getDeferred(): BeforeInstallPromptEvent | null {
  return deferred
}

/** Shows the native install dialog. Returns true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  // The event can only be used once.
  deferred = null
  emit()
  return outcome === 'accepted'
}
