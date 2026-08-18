import { describe, it, expect } from 'vitest'
import { groupNotesByDay, noteMatchesExercise, tagFilterOptions } from './noteFormat'
import type { NoteWithTags } from '../../data/noteRepo'

/** ISO timestamp for a specific *local* wall-clock time.
 *
 * Fixtures are built from local components rather than fixed `...Z` strings on purpose.
 * `groupNotesByDay` buckets by local day, so `'2026-08-17T09:00:00Z'` lands on the 17th in
 * most zones but on the 16th in UTC-11 — a test asserting a bucket count from UTC literals
 * passes or fails depending on the machine's timezone. Constructing from local parts and
 * reading them back locally is stable everywhere. */
function at(year: number, month: number, day: number, hour = 12, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

function note(id: string, createdAt: string, exerciseIds: string[] = []): NoteWithTags {
  return {
    id,
    user_id: 'u1',
    body: `body ${id}`,
    session_id: null,
    created_at: createdAt,
    updated_at: createdAt,
    exerciseIds,
  }
}

describe('groupNotesByDay', () => {
  it('returns [] for no notes', () => {
    expect(groupNotesByDay([])).toEqual([])
  })

  it('groups by local day, days newest first, notes newest first inside a day', () => {
    const out = groupNotesByDay([
      note('a', at(2026, 8, 17, 9)),
      note('b', at(2026, 8, 15, 18)),
      note('c', at(2026, 8, 17, 20)),
    ])
    expect(out.length).toBe(2)
    expect(out[0].notes.map((n) => n.id)).toEqual(['c', 'a'])
    expect(out[1].notes.map((n) => n.id)).toEqual(['b'])
    expect(out[0].day > out[1].day).toBe(true)
  })

  it('splits either side of local midnight', () => {
    // 30 minutes apart, but a different local calendar day — the case a UTC-based
    // grouping gets wrong for any user not on UTC.
    const out = groupNotesByDay([
      note('late', at(2026, 8, 17, 23, 30)),
      note('early', at(2026, 8, 18, 0, 30)),
    ])
    expect(out.length).toBe(2)
    expect(out[0].notes.map((n) => n.id)).toEqual(['early'])
    expect(out[1].notes.map((n) => n.id)).toEqual(['late'])
  })

  it('keeps a whole local day in one bucket however wide the spread', () => {
    const out = groupNotesByDay([
      note('dawn', at(2026, 8, 17, 0, 1)),
      note('noon', at(2026, 8, 17, 12)),
      note('dusk', at(2026, 8, 17, 23, 59)),
    ])
    expect(out.length).toBe(1)
    expect(out[0].notes.map((n) => n.id)).toEqual(['dusk', 'noon', 'dawn'])
  })

  it('orders days correctly across a year boundary', () => {
    const out = groupNotesByDay([
      note('old', at(2025, 12, 31, 12)),
      note('new', at(2026, 1, 1, 12)),
    ])
    // 'YYYY-MM-DD' is fixed-width and zero-padded, so lexicographic order is chronological.
    expect(out.map((g) => g.notes[0].id)).toEqual(['new', 'old'])
  })

  it('never reorders or mutates the caller-supplied array', () => {
    // The page holds this same array in React state; sorting it in place would be a
    // silent action-at-a-distance bug.
    const input = [
      note('a', at(2026, 8, 15, 9)),
      note('b', at(2026, 8, 17, 9)),
      note('c', at(2026, 8, 16, 9)),
    ]
    const snapshot = input.map((n) => n.id)
    groupNotesByDay(input)
    expect(input.map((n) => n.id)).toEqual(snapshot)
  })

  it('accounts for every note exactly once', () => {
    const input = [
      note('a', at(2026, 8, 17, 9)),
      note('b', at(2026, 8, 17, 10)),
      note('c', at(2026, 8, 16, 9)),
      note('d', at(2026, 8, 14, 9)),
    ]
    const out = groupNotesByDay(input)
    const ids = out.flatMap((g) => g.notes.map((n) => n.id)).sort()
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('noteMatchesExercise', () => {
  const tagged = note('a', at(2026, 8, 17), ['e1', 'e2'])
  const untagged = note('b', at(2026, 8, 17), [])

  it('matches a tagged exercise', () => {
    expect(noteMatchesExercise(tagged, 'e2')).toBe(true)
  })

  it('rejects an exercise the note is not tagged with', () => {
    expect(noteMatchesExercise(tagged, 'e9')).toBe(false)
    expect(noteMatchesExercise(untagged, 'e1')).toBe(false)
  })

  it('matches everything when the filter is null, including an untagged note', () => {
    expect(noteMatchesExercise(tagged, null)).toBe(true)
    expect(noteMatchesExercise(untagged, null)).toBe(true)
  })
})

describe('tagFilterOptions', () => {
  const names = { e1: 'Squat', e2: 'Bench Press', e3: 'Row' }

  it('returns the distinct tagged exercises, name-sorted', () => {
    const out = tagFilterOptions(
      [
        note('a', at(2026, 8, 17), ['e1', 'e2']),
        note('b', at(2026, 8, 16), ['e2', 'e3']),
      ],
      names,
    )
    expect(out.map((o) => o.name)).toEqual(['Bench Press', 'Row', 'Squat'])
    expect(out.map((o) => o.exerciseId)).toEqual(['e2', 'e3', 'e1'])
  })

  it('returns [] when no note has a tag', () => {
    expect(tagFilterOptions([note('a', at(2026, 8, 17), [])], names)).toEqual([])
    expect(tagFilterOptions([], names)).toEqual([])
  })

  it('falls back to a dash for an id missing from the name map', () => {
    // A tag whose exercise row is gone, or names not loaded yet: keep the chip rather
    // than dropping a filter the user can see notes for.
    expect(tagFilterOptions([note('a', at(2026, 8, 17), ['gone'])], names)).toEqual([
      { exerciseId: 'gone', name: '—' },
    ])
  })

  it('keeps both entries when two exercises share a name', () => {
    // Legitimate: a user's custom "Row" alongside the seeded one. Both chips must survive,
    // and the order must be deterministic across reloads for the same input.
    const dupes = { e1: 'Row', e2: 'Row', e3: 'Squat' }
    const notes = [note('a', at(2026, 8, 17), ['e1', 'e2', 'e3'])]
    const out = tagFilterOptions(notes, dupes)
    expect(out.map((o) => o.name)).toEqual(['Row', 'Row', 'Squat'])
    expect(tagFilterOptions(notes, dupes)).toEqual(out)
  })

  it('does not mutate its inputs', () => {
    const notes = [note('a', at(2026, 8, 17), ['e2', 'e1'])]
    const snapshot = [...notes[0].exerciseIds]
    tagFilterOptions(notes, names)
    expect(notes[0].exerciseIds).toEqual(snapshot)
  })
})
