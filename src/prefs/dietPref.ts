import { useSyncExternalStore } from 'react'

export type Diet = 'veg' | 'egg' | 'nonveg'

const KEY = 'momentum.diet'
const listeners = new Set<() => void>()

function read(): Diet {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'egg' || v === 'nonveg' ? v : 'veg'
  } catch {
    return 'veg'
  }
}

let current = read()

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function setDiet(d: Diet): void {
  current = d
  try { localStorage.setItem(KEY, d) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function useDiet(): Diet {
  return useSyncExternalStore(subscribe, () => current, () => 'veg' as Diet)
}
