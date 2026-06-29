import { useSyncExternalStore } from 'react'

export type ChartCurve = 'straight' | 'smooth'

const KEY = 'momentum.chartCurve'
const listeners = new Set<() => void>()

function read(): ChartCurve {
  try {
    return localStorage.getItem(KEY) === 'smooth' ? 'smooth' : 'straight'
  } catch {
    return 'straight'
  }
}

let current: ChartCurve = read()

function getSnapshot(): ChartCurve {
  return current
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Cosmetic display preference for chart line style — persisted in localStorage (like the theme). */
export function setChartCurve(curve: ChartCurve): void {
  current = curve
  try {
    localStorage.setItem(KEY, curve)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useChartCurve(): ChartCurve {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'straight' as ChartCurve)
}
