export interface SetRow { sessionId: string; date: string; weight: number; reps: number }
export interface ProgressionPoint { date: string; e1rm: number; volume: number }

/** Epley estimated 1RM: weight * (1 + reps/30). */
export function epley1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

/** Group flat set rows by session: top-set Est.1RM + total volume, oldest→newest. */
export function summarizeSessions(rows: SetRow[]): ProgressionPoint[] {
  const bySession = new Map<string, ProgressionPoint>()
  for (const r of rows) {
    const e = epley1RM(r.weight, r.reps)
    const vol = r.weight * r.reps
    const cur = bySession.get(r.sessionId)
    if (!cur) bySession.set(r.sessionId, { date: r.date, e1rm: e, volume: vol })
    else { cur.e1rm = Math.max(cur.e1rm, e); cur.volume += vol }
  }
  return [...bySession.values()].sort((a, b) => a.date.localeCompare(b.date))
}
