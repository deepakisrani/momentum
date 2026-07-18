import { useSyncExternalStore } from 'react'

const KEY = 'momentum.proteinPerKg'
const MIN = 1.6
const MAX = 3.0
const listeners = new Set<() => void>()

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(n * 10) / 10))
}

function read(): number | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = Number(raw)
    return Number.isFinite(v) && v > 0 ? clamp(v) : null
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
  current = v === null ? null : clamp(v)
  try {
    if (current === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(current))
  } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function useProteinPerKg(): number | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}
