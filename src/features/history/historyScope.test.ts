import { describe, it, expect } from 'vitest'
import { historyScopeOptions, defaultHistoryScope, scopeKey, splitByRun, UNASSIGNED_KEY } from './historyScope'
import type { MesoRow } from '../../data/rows'

function meso(id: string, name: string, opts?: { active?: boolean; deleted?: boolean; activatedAt?: string }): MesoRow {
  return {
    id, user_id: 'u1', name,
    deload_every_n_microcycles: null,
    is_active: opts?.active ?? false,
    notes: null,
    created_at: `2026-0${id.length}-01T00:00:00Z`,
    deleted_at: opts?.deleted ? '2026-08-01T00:00:00Z' : null,
    activated_at: opts?.activatedAt ?? null,
  }
}

describe('scopeKey', () => {
  it('is the meso id, or a fixed key for unassigned', () => {
    expect(scopeKey({ kind: 'meso', mesoId: 'm1' })).toBe('m1')
    expect(scopeKey({ kind: 'unassigned' })).toBe(UNASSIGNED_KEY)
  })
})

describe('historyScopeOptions', () => {
  it('lists mesos in the order given, deleted ones included', () => {
    const out = historyScopeOptions([meso('m1', 'Push/Pull'), meso('m2', 'Upper/Lower', { deleted: true })], false)
    expect(out.map((o) => o.mesoName)).toEqual(['Push/Pull', 'Upper/Lower'])
    expect(out.map((o) => o.key)).toEqual(['m1', 'm2'])
  })

  it('appends unassigned only when orphans exist', () => {
    expect(historyScopeOptions([meso('m1', 'A')], false).map((o) => o.key)).toEqual(['m1'])
    const withOrphans = historyScopeOptions([meso('m1', 'A')], true)
    expect(withOrphans.map((o) => o.key)).toEqual(['m1', UNASSIGNED_KEY])
    expect(withOrphans[1].mesoName).toBeNull()
    expect(withOrphans[1].scope).toEqual({ kind: 'unassigned' })
  })

  it('can offer unassigned as the only option', () => {
    expect(historyScopeOptions([], true).map((o) => o.key)).toEqual([UNASSIGNED_KEY])
  })

  it('returns [] when there is nothing at all', () => {
    expect(historyScopeOptions([], false)).toEqual([])
  })
})

describe('defaultHistoryScope', () => {
  it('prefers the active meso even when it is not the newest', () => {
    expect(defaultHistoryScope([meso('m1', 'Newest'), meso('m22', 'Older', { active: true })], false))
      .toEqual({ kind: 'meso', mesoId: 'm22' })
  })

  it('falls back to the first meso when none is active', () => {
    expect(defaultHistoryScope([meso('m1', 'A'), meso('m22', 'B')], false)).toEqual({ kind: 'meso', mesoId: 'm1' })
  })

  it('falls back to unassigned when there are no mesos', () => {
    expect(defaultHistoryScope([], true)).toEqual({ kind: 'unassigned' })
  })

  it('is null when there is nothing to show', () => {
    expect(defaultHistoryScope([], false)).toBeNull()
  })

  it('does not skip a deleted meso -- a deleted meso is still readable history', () => {
    expect(defaultHistoryScope([meso('m1', 'Gone', { deleted: true })], false)).toEqual({ kind: 'meso', mesoId: 'm1' })
  })
})

describe('splitByRun', () => {
  const sessions = [
    { id: 'c', started_at: '2026-08-20T10:00:00Z' },
    { id: 'b', started_at: '2026-08-10T10:00:00Z' },
    { id: 'a', started_at: '2026-06-01T10:00:00Z' },
  ]

  it('treats everything as current when the meso was never re-activated', () => {
    const out = splitByRun(sessions, null)
    expect(out.current.map((s) => s.id)).toEqual(['c', 'b', 'a'])
    expect(out.earlier).toEqual([])
  })

  it('splits at the activation timestamp', () => {
    const out = splitByRun(sessions, '2026-08-15T00:00:00Z')
    expect(out.current.map((s) => s.id)).toEqual(['c'])
    expect(out.earlier.map((s) => s.id)).toEqual(['b', 'a'])
  })

  it('counts a session exactly on the boundary as current', () => {
    const out = splitByRun(sessions, '2026-08-10T10:00:00Z')
    expect(out.current.map((s) => s.id)).toEqual(['c', 'b'])
    expect(out.earlier.map((s) => s.id)).toEqual(['a'])
  })

  it('can put everything in earlier', () => {
    const out = splitByRun(sessions, '2026-09-01T00:00:00Z')
    expect(out.current).toEqual([])
    expect(out.earlier.map((s) => s.id)).toEqual(['c', 'b', 'a'])
  })

  it('preserves input order within each group and does not mutate the input', () => {
    const input = [...sessions]
    const out = splitByRun(input, '2026-08-15T00:00:00Z')
    expect(input.map((s) => s.id)).toEqual(['c', 'b', 'a'])
    expect(out.current).not.toBe(input)
  })

  it('is safe on an empty list', () => {
    expect(splitByRun([], '2026-08-15T00:00:00Z')).toEqual({ current: [], earlier: [] })
  })

  it('treats an empty-string activated_at as no window, not as a boundary', () => {
    const out = splitByRun(sessions, '')
    expect(out.current.map((s) => s.id)).toEqual(['c', 'b', 'a'])
    expect(out.earlier).toEqual([])
  })

  it('partitions correctly even when the input is not sorted by date', () => {
    const unsorted = [sessions[1], sessions[2], sessions[0]] // b, a, c
    const out = splitByRun(unsorted, '2026-08-15T00:00:00Z')
    expect(out.current.map((s) => s.id)).toEqual(['c'])
    expect(out.earlier.map((s) => s.id)).toEqual(['b', 'a'])
  })

  it('does not copy the session objects, so extra fields survive the split', () => {
    const rich = [{ id: 'x', started_at: '2026-08-20T10:00:00Z', is_deload: true, exerciseCount: 5 }]
    const out = splitByRun(rich, '2026-08-15T00:00:00Z')
    expect(out.current[0]).toBe(rich[0])
    expect(out.current[0].exerciseCount).toBe(5)
  })

  it('does not alias the input even on the no-window path', () => {
    const input = [...sessions]
    expect(splitByRun(input, null).current).not.toBe(input)
  })
})

// Invariants that span the functions -- the switcher breaks in ways no single-function test
// would notice if these drift apart.
describe('scope invariants', () => {
  it('keys every option by scopeKey, so a <select> value maps back to a scope', () => {
    for (const o of historyScopeOptions([meso('m1', 'A'), meso('m2', 'B', { deleted: true })], true)) {
      expect(o.key).toBe(scopeKey(o.scope))
    }
  })

  it('always defaults to a scope that is actually one of the options', () => {
    const cases: [MesoRow[], boolean][] = [
      [[meso('m1', 'A'), meso('m22', 'B', { active: true })], true],
      [[meso('m1', 'A')], false],
      [[meso('m1', 'A', { deleted: true })], true],
      [[], true],
    ]
    for (const [mesos, hasUnassigned] of cases) {
      const scope = defaultHistoryScope(mesos, hasUnassigned)
      const keys = historyScopeOptions(mesos, hasUnassigned).map((o) => o.key)
      expect(scope).not.toBeNull()
      expect(keys).toContain(scopeKey(scope!))
    }
  })

  it('offers no options exactly when there is no default scope', () => {
    expect(historyScopeOptions([], false)).toEqual([])
    expect(defaultHistoryScope([], false)).toBeNull()
  })

  it('cannot collide UNASSIGNED_KEY with a meso id, which is always a uuid', () => {
    expect(UNASSIGNED_KEY).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('picks the first of two active mesos rather than behaving unpredictably', () => {
    // The `one_active_meso_per_user` partial index should make this impossible; if a bad row
    // ever exists, the newest-first ordering makes the choice deterministic.
    const out = defaultHistoryScope([meso('m1', 'Newer', { active: true }), meso('m22', 'Older', { active: true })], false)
    expect(out).toEqual({ kind: 'meso', mesoId: 'm1' })
  })
})
