import type { NoteWithTags } from '../../data/noteRepo'
import { localIsoDate } from '../history/historyFormat'

export interface NoteDayGroup {
  day: string
  notes: NoteWithTags[]
}

/** Buckets notes by **local** calendar day (via `localIsoDate` — a UTC slice of the ISO
 * string would disagree with what `shortDate` displays for a note written near midnight
 * in a timezone ahead of UTC). Days come back newest first; notes within a day come back
 * newest first too, regardless of the input order. Never mutates `notes` or its elements —
 * the page holds this same array in React state. */
export function groupNotesByDay(notes: NoteWithTags[]): NoteDayGroup[] {
  const byDay = new Map<string, NoteWithTags[]>()
  for (const n of notes) {
    const day = localIsoDate(n.created_at)
    const bucket = byDay.get(day)
    if (bucket) bucket.push(n)
    else byDay.set(day, [n])
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, dayNotes]) => ({
      day,
      notes: [...dayNotes].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)),
    }))
}

/** `null` means "All" — it matches every note, tagged or not. */
export function noteMatchesExercise(note: NoteWithTags, exerciseId: string | null): boolean {
  if (exerciseId === null) return true
  return note.exerciseIds.includes(exerciseId)
}

/** The distinct exercises tagged across `notes`, name-sorted, for the filter chips.
 * `namesById` is keyed by exercise id; an id missing from it (a deleted exercise, or a
 * caller that hasn't loaded names yet) falls back to '—' rather than dropping the chip. */
export function tagFilterOptions(
  notes: NoteWithTags[],
  namesById: Record<string, string>,
): { exerciseId: string; name: string }[] {
  const ids = new Set<string>()
  for (const n of notes) {
    for (const id of n.exerciseIds) ids.add(id)
  }
  return [...ids]
    .map((exerciseId) => ({ exerciseId, name: namesById[exerciseId] ?? '—' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
