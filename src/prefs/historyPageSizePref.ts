import { useSyncExternalStore } from 'react'

export const HISTORY_PAGE_SIZE_DEFAULT = 10
export const HISTORY_PAGE_SIZES = [10, 25, 50] as const
export type HistoryPageSize = typeof HISTORY_PAGE_SIZES[number]

const KEY = 'momentum.historyPageSize'
const listeners = new Set<() => void>()

function isPageSize(value: number): value is HistoryPageSize {
  return (HISTORY_PAGE_SIZES as readonly number[]).includes(value)
}

function read(): HistoryPageSize {
  try {
    const value = Number(localStorage.getItem(KEY))
    return isPageSize(value) ? value : HISTORY_PAGE_SIZE_DEFAULT
  } catch {
    return HISTORY_PAGE_SIZE_DEFAULT
  }
}

let current: HistoryPageSize = read()

export function setHistoryPageSize(value: number): void {
  if (!isPageSize(value)) return
  current = value
  try { localStorage.setItem(KEY, String(value)) } catch { /* ignore */ }
  listeners.forEach((listener) => listener())
}

export function useHistoryPageSize(): HistoryPageSize {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    () => current,
    () => HISTORY_PAGE_SIZE_DEFAULT,
  )
}
