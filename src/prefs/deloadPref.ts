import { useSyncExternalStore } from 'react'

const KEY = 'momentum.deloadPct'
export const DELOAD_PCT_DEFAULT = 60
const MIN = 40
const MAX = 100

const listeners = new Set<() => void>()

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(n / 5) * 5))
}

function read(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isFinite(v) && v > 0 ? clamp(v) : DELOAD_PCT_DEFAULT
  } catch {
    return DELOAD_PCT_DEFAULT
  }
}

let current = read()

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Deload working weight as a % of your last top set — a personal training preference (localStorage, per-device). */
export function setDeloadPct(pct: number): void {
  current = clamp(pct)
  try {
    localStorage.setItem(KEY, String(current))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useDeloadPct(): number {
  return useSyncExternalStore(subscribe, () => current, () => DELOAD_PCT_DEFAULT)
}
