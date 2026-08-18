import { describe, it, expect } from 'vitest'
import { flattenNoteQuery, type QNote } from './noteRepo'

function qNote(id: string, tags: { exercise_id: string }[] | null, sessionId: string | null = null): QNote {
  return {
    id,
    user_id: 'u1',
    body: `body ${id}`,
    session_id: sessionId,
    created_at: '2026-08-17T09:00:00Z',
    updated_at: '2026-08-17T09:00:00Z',
    note_exercise: tags,
  }
}

describe('flattenNoteQuery', () => {
  it('returns an empty array for no notes', () => {
    expect(flattenNoteQuery([])).toEqual([])
  })

  it('lifts every embedded tag to exerciseIds and keeps the note fields', () => {
    const out = flattenNoteQuery([qNote('n1', [{ exercise_id: 'e1' }, { exercise_id: 'e2' }], 's1')])
    expect(out).toEqual([
      {
        id: 'n1',
        user_id: 'u1',
        body: 'body n1',
        session_id: 's1',
        created_at: '2026-08-17T09:00:00Z',
        updated_at: '2026-08-17T09:00:00Z',
        exerciseIds: ['e1', 'e2'],
      },
    ])
  })

  it('sorts tag ids so a note renders its chips in a stable order', () => {
    const out = flattenNoteQuery([qNote('n1', [{ exercise_id: 'e2' }, { exercise_id: 'e1' }])])
    expect(out[0].exerciseIds).toEqual(['e1', 'e2'])
  })

  it('treats a missing embed as no tags', () => {
    expect(flattenNoteQuery([qNote('n1', null)])[0].exerciseIds).toEqual([])
    expect(flattenNoteQuery([qNote('n1', [])])[0].exerciseIds).toEqual([])
  })

  it('preserves the order the query returned notes in', () => {
    const out = flattenNoteQuery([qNote('n3', []), qNote('n1', []), qNote('n2', [])])
    expect(out.map((n) => n.id)).toEqual(['n3', 'n1', 'n2'])
  })
})
