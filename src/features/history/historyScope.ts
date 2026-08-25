import type { MesoRow } from '../../data/rows'

/** What History is showing: one meso, or the sessions that belong to no meso. */
export type HistoryScope = { kind: 'meso'; mesoId: string } | { kind: 'unassigned' }

export interface ScopeOption {
  /** Stable key for React lists and for `<select>` option values. */
  key: string
  scope: HistoryScope
  /** Null for the unassigned entry: the caller supplies its translated label. Keeping i18n
   * out of this module is what lets these functions be tested without a provider. */
  mesoName: string | null
}

/** `<select>` value for the unassigned bucket. Underscores keep it clear of the uuid
 * alphabet (hex digits and dashes), so it can never collide with a meso id. */
export const UNASSIGNED_KEY = '__unassigned__'

export function scopeKey(scope: HistoryScope): string {
  return scope.kind === 'meso' ? scope.mesoId : UNASSIGNED_KEY
}

/** Switcher options in the order `mesos` was given — `listMesosForHistory` already sorts
 * newest first, and re-sorting here would only let the two disagree.
 *
 * Soft-deleted mesos are included on purpose (keeping their log readable is the whole reason
 * they are soft-deleted rather than dropped) and carry no marker: to History they are simply
 * another block of training. Unassigned is appended only when orphaned sessions exist, so
 * users who have none never see the entry. */
export function historyScopeOptions(mesos: MesoRow[], hasUnassigned: boolean): ScopeOption[] {
  const options: ScopeOption[] = mesos.map((m) => ({
    key: m.id,
    scope: { kind: 'meso', mesoId: m.id },
    mesoName: m.name,
  }))
  if (hasUnassigned) options.push({ key: UNASSIGNED_KEY, scope: { kind: 'unassigned' }, mesoName: null })
  return options
}

/** Active meso → newest meso → unassigned → nothing to show.
 *
 * The active meso is not filtered by `deleted_at`: a soft-deleted meso is legitimate History,
 * and History is the only place it is still readable. (`deleteMeso` clears `is_active`, so a
 * row that is both should not exist anyway.) */
export function defaultHistoryScope(mesos: MesoRow[], hasUnassigned: boolean): HistoryScope | null {
  const active = mesos.find((m) => m.is_active)
  if (active) return { kind: 'meso', mesoId: active.id }
  if (mesos.length > 0) return { kind: 'meso', mesoId: mesos[0].id }
  if (hasUnassigned) return { kind: 'unassigned' }
  return null
}

/** Split a meso's sessions at the start of its current run.
 *
 * Compares the ISO-8601 UTC timestamps as strings rather than parsing them into `Date`s:
 * that format sorts lexicographically, which is the same assumption `listMesoSessions`
 * already relies on for `.order('started_at')`.
 *
 * A session exactly on the boundary counts as current — `activated_at` is the moment the run
 * began, so a workout stamped identically belongs to it. A missing `activated_at` (null, or
 * an empty string from a stray write) means no window at all: the meso has never been
 * re-activated, so everything it owns is the current run.
 *
 * Each group keeps the input order, so a caller that fetched newest-first stays newest-first;
 * neither group aliases the input, so React state passed in cannot be mutated through the
 * result.
 *
 * Known limitation: one timestamp cannot separate three or more runs — every block before the
 * latest activation lands in `earlier` together. Accepted when the column was chosen. */
export function splitByRun<T extends { started_at: string }>(
  sessions: T[],
  activatedAt: string | null,
): { current: T[]; earlier: T[] } {
  if (!activatedAt) return { current: [...sessions], earlier: [] }
  const current: T[] = []
  const earlier: T[] = []
  for (const s of sessions) {
    if (s.started_at >= activatedAt) current.push(s)
    else earlier.push(s)
  }
  return { current, earlier }
}
