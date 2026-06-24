export type RelativeDate =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'daysAgo'; n: number }
  | { kind: 'weeksAgo'; n: number }

/** Concise calendar date, e.g. "16 Jun" (order is locale-dependent). */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Structured relative phrase vs `now`. Component maps kind -> i18n copy. */
export function relativeDate(iso: string, now: Date): RelativeDate {
  const dayNum = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((dayNum(now) - dayNum(new Date(iso))) / 86_400_000)
  if (days <= 0) return { kind: 'today' }
  if (days === 1) return { kind: 'yesterday' }
  if (days < 7) return { kind: 'daysAgo', n: days }
  return { kind: 'weeksAgo', n: Math.floor(days / 7) }
}

/** "1h 12m" / "45m" between start and end; null if no/invalid end. */
export function formatDuration(startIso: string, endIso: string | null): string | null {
  if (!endIso) return null
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (ms < 0) return null
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
