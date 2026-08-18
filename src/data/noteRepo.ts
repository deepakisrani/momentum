import { supabase } from '../lib/supabase'
import type { NoteExerciseRow, NoteRow } from './rows'

/** A note plus the ids of every exercise tagged on it. */
export type NoteWithTags = NoteRow & { exerciseIds: string[] }

// Shape of the nested select response (only the fields we request).
export interface QNote extends NoteRow {
  note_exercise: { exercise_id: string }[] | null
}

const NOTE_SELECT = 'id, user_id, body, session_id, created_at, updated_at, note_exercise ( exercise_id )'

/** Flatten the nested note query, lifting the embedded tag rows to a plain id list.
 * Note order is preserved from the query; tag ids are sorted because PostgREST does not
 * order embedded rows, and unsorted ids would shuffle a note's chips between loads. */
export function flattenNoteQuery(notes: QNote[]): NoteWithTags[] {
  return notes.map((n) => ({
    id: n.id,
    user_id: n.user_id,
    body: n.body,
    session_id: n.session_id,
    created_at: n.created_at,
    updated_at: n.updated_at,
    exerciseIds: (n.note_exercise ?? []).map((t) => t.exercise_id).sort(),
  }))
}

/** Notes for a user, newest first, each carrying ALL of its tags. Optionally narrowed to
 * one tagged exercise and/or one session of origin.
 *
 * The exercise filter runs in two steps on purpose. Filtering with an embedded
 * `note_exercise!inner(exercise_id)` + `.eq(...)` would restrict the embed to the MATCHING
 * tag, so a note tagged with three exercises would come back holding one — the same
 * PostgREST behaviour getLastPerformance relies on deliberately. Step one is safe without a
 * user_id filter: note_exercise_self's `using (exists (... n.user_id = auth.uid()))` clause
 * hides other users' rows, and step two re-filters on user_id anyway. */
export async function listNotes(
  userId: string,
  opts?: { exerciseId?: string; sessionId?: string },
): Promise<NoteWithTags[]> {
  let noteIds: string[] | null = null
  if (opts?.exerciseId) {
    const { data, error } = await supabase
      .from('note_exercise')
      .select('note_id')
      .eq('exercise_id', opts.exerciseId)
    if (error) throw error
    noteIds = ((data ?? []) as Pick<NoteExerciseRow, 'note_id'>[]).map((r) => r.note_id)
    if (!noteIds.length) return []
  }
  let q = supabase
    .from('note')
    .select(NOTE_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  // `in` and `order` are independent parts of the request, so the newest-first order holds.
  if (noteIds) q = q.in('id', noteIds)
  if (opts?.sessionId) q = q.eq('session_id', opts.sessionId)
  const { data, error } = await q
  if (error) throw error
  return flattenNoteQuery((data ?? []) as unknown as QNote[])
}

/** Inserts the note, then its tag rows; returns the new note id.
 *
 * The two writes are not one transaction — PostgREST cannot span them — so a failing tag
 * insert leaves a saved, untagged note and throws. That is deliberate: the body is the part
 * the user cannot retype from nothing, and tags are two taps to re-add, so this does not
 * compensate by deleting the note it just wrote. */
export async function createNote(
  userId: string,
  input: { body: string; sessionId: string | null; exerciseIds: string[] },
): Promise<string> {
  const body = requireBody(input.body)
  const { data, error } = await supabase
    .from('note')
    .insert({ user_id: userId, body, session_id: input.sessionId })
    .select('id')
    .single()
  if (error) throw error
  const noteId = data.id as string
  await replaceTags(noteId, input.exerciseIds)
  return noteId
}

/** Updates the body and replaces the tag set. `updated_at` is set here because this schema
 * has no updated_at trigger (0003's is the only trigger, and it is on auth.users). */
export async function updateNote(
  noteId: string,
  input: { body: string; exerciseIds: string[] },
): Promise<void> {
  const body = requireBody(input.body)
  const { error } = await supabase
    .from('note')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', noteId)
  if (error) throw error
  await replaceTags(noteId, input.exerciseIds)
}

/** Tags cascade via the FK. */
export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase.from('note').delete().eq('id', noteId)
  if (error) throw error
}

/** Replace a note's tag set: clear, then insert. Two predictable writes, no diffing.
 * De-duplicates because a repeated id would violate the note_exercise primary key. */
async function replaceTags(noteId: string, exerciseIds: string[]): Promise<void> {
  const { error: delError } = await supabase.from('note_exercise').delete().eq('note_id', noteId)
  if (delError) throw delError
  const unique = [...new Set(exerciseIds)]
  if (!unique.length) return // never POST an empty array; PostgREST's response to one is not worth relying on
  const { error } = await supabase
    .from('note_exercise')
    .insert(unique.map((exerciseId) => ({ note_id: noteId, exercise_id: exerciseId })))
  if (error) throw error
}

/** The DB enforces `check (length(trim(body)) > 0)`, but a violation arrives as a raw
 * Postgres constraint string, so fail here instead and never spend the round trip. */
function requireBody(body: string): string {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Note body cannot be empty')
  return trimmed
}
