import { useSyncExternalStore } from 'react'

const KEY = 'momentum.proteinPerKg'
const listeners = new Set<() => void>()

function read(): number | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = Number(raw)
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

let current = read()

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Protein g/kg override; null = derive from goal. */
export function setProteinPerKg(v: number | null): void {
  current = v
  try {
    if (v === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(v))
  } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function useProteinPerKg(): number | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}
