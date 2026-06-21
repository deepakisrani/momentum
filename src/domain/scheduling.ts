import type { WeekStartsOn } from './types'

// --- Deload cadence & debt ---

export function isScheduledDeload(microcycleNumber: number, deloadEveryN: number | null): boolean {
  if (!deloadEveryN || deloadEveryN <= 0) return false
  if (microcycleNumber <= 0) return false // microcycles are 1-based; cycle 0 is never a deload
  return microcycleNumber % deloadEveryN === 0
}

export function shouldDeload(
  microcycleNumber: number,
  deloadEveryN: number | null,
  carriedDebt: boolean,
): boolean {
  return isScheduledDeload(microcycleNumber, deloadEveryN) || carriedDebt
}

/** At microcycle end: a deload that was due but not actually performed is owed forward. */
export function nextDeloadDebt(deloadWasDue: boolean, actuallyDeloaded: boolean): boolean {
  return deloadWasDue && !actuallyDeloaded
}

// --- Calendar-week slate ---

/** Day-types not yet completed this week, in their original order. Membership is by reference (===), so use primitive day-type ids. */
export function remainingSlate<T>(allDayTypes: T[], completedThisWeek: T[]): T[] {
  const done = new Set(completedThisWeek)
  return allDayTypes.filter((d) => !done.has(d))
}

/** Midnight of the week-start day (weekStartsOn: 0=Sun..6=Sat) containing `d`. */
export function startOfWeek(d: Date, weekStartsOn: WeekStartsOn): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = (date.getDay() - weekStartsOn + 7) % 7
  date.setDate(date.getDate() - diff)
  return date
}

/** True if `now` falls in a strictly later week than `currentWeekStart`. */
export function hasWeekRolledOver(currentWeekStart: Date, now: Date, weekStartsOn: WeekStartsOn): boolean {
  return startOfWeek(now, weekStartsOn).getTime() > startOfWeek(currentWeekStart, weekStartsOn).getTime()
}

// --- Continuous rotation ---

/** The next day-type in order, advancing by completed count; null if there are none. */
export function nextInRotation<T>(orderedDayTypes: T[], completedCount: number): T | null {
  if (orderedDayTypes.length === 0) return null
  return orderedDayTypes[completedCount % orderedDayTypes.length]
}

// --- Sliding-window deload ---

/** Count of the most-recent consecutive NON-deload sessions (i.e., sessions completed since the last actual deload). Input is newest-first. */
export function sessionsSinceLastDeload(sessionsNewestFirst: { isDeload: boolean }[]): number {
  let n = 0
  for (const s of sessionsNewestFirst) {
    if (s.isDeload) break
    n++
  }
  return n
}

/** Carry-forward sliding window: the session about to start is a deload when sessions-since-last-deload + 1 >= N. Overridden (non-deload) sessions don't reset the window, so a skipped deload stays due. */
export function isDeloadDue(sessionsSinceLastDeload: number, deloadEveryN: number | null): boolean {
  if (!deloadEveryN || deloadEveryN <= 0) return false
  return sessionsSinceLastDeload + 1 >= deloadEveryN
}
