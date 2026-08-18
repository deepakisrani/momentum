import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { listNotes, deleteNote, type NoteWithTags } from '../../data/noteRepo'
import { getExercisesByIds } from '../../data/exerciseRepo'
import { groupNotesByDay, noteMatchesExercise, tagFilterOptions } from './noteFormat'
import { NoteEditorSheet } from './NoteEditorSheet'
import { ConfirmModal } from '../../components/ConfirmModal'
import { shortDate, relativeDate, type RelativeDate } from '../history/historyFormat'

// Same shape as PreviousWorkoutPanel's; that one is file-local, and exporting it would mean
// editing a file this change has no other business in.
function renderRelative(r: RelativeDate, t: (k: string) => string): string {
  switch (r.kind) {
    case 'today': return t('history.today')
    case 'yesterday': return t('history.yesterday')
    case 'daysAgo': return `${r.n} ${t('history.daysAgo')}`
    case 'weeksAgo': return `${r.n} ${r.n === 1 ? t('history.weekAgo') : t('history.weeksAgo')}`
  }
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** The read surface: every note the user has written, newest first, grouped by local day,
 * narrowable to one tagged exercise. */
export function NotesPage() {
  const t = useT()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [notes, setNotes] = useState<NoteWithTags[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<NoteWithTags | null>(null)
  const [pendingDelete, setPendingDelete] = useState<NoteWithTags | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [error, setError] = useState(false)

  /** Never rejects: the editor awaits this from its own try block, so a failed reload here
   * would otherwise be reported to the user as a failed save. */
  const load = useCallback(async () => {
    if (!userId) return
    setError(false)
    try {
      // One unfiltered fetch. The exercise filter is applied in memory with
      // noteMatchesExercise rather than re-querying, because the chip row already needs the
      // whole set: a server-side filter would mean fetching everything AND fetching a subset
      // of what we just fetched (three requests, since listNotes' exercise filter is itself
      // two round trips), and the two responses could disagree about a note written between
      // them. Notes are a few hundred rows of the user's own text at the outside.
      const all = await listNotes(userId)
      setNotes(all)
      const ids = [...new Set(all.flatMap((n) => n.exerciseIds))]
      const byId = ids.length ? await getExercisesByIds(ids) : {}
      setNames(Object.fromEntries(Object.entries(byId).map(([id, ex]) => [id, ex.name])))
      // Deleting or retagging the last note carrying the active filter removes its chip. Left
      // alone, the filter would still be set and the user would be staring at an empty list
      // with no chip to click their way out of.
      setFilter((f) => (f !== null && !ids.includes(f) ? null : f))
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Notes] load failed:', err)
      setError(true)
      setNotes((cur) => cur ?? [])
    }
  }, [userId])

  useEffect(() => { void load() }, [load])

  async function confirmDelete(n: NoteWithTags) {
    setPendingDelete(null)
    setBusyId(n.id)
    setRowError(null)
    try {
      await deleteNote(n.id)
      await load() // reload rather than splice it out: the list only changes once the server agrees
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Notes] delete failed:', err)
      // Reported on the row itself, not at the top of the page — after scrolling down to a
      // note from three weeks ago, a banner above the fold is a message the user never sees.
      setRowError(n.id)
    } finally {
      setBusyId(null)
    }
  }

  const chip = (active: boolean) =>
    `max-w-full truncate rounded-full px-3 py-1 text-xs font-semibold ${active ? 'bg-brand-700 text-white' : 'bg-slate-100 dark:bg-[#1b2030]'}`
  const all = notes ?? []
  const options = tagFilterOptions(all, names)
  const days = groupNotesByDay(all.filter((n) => noteMatchesExercise(n, filter)))
  const now = new Date()

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">{t('notes.title')}</h1>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="shrink-0 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
          >
            {t('notes.new')}
          </button>
        </div>

        {/* Driven by the unfiltered set, so narrowing the list never removes the chips — and
            rendered whenever a filter is set even if its options somehow emptied, so "All" is
            always reachable. */}
        {(options.length > 0 || filter !== null) && (
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={filter === null} className={chip(filter === null)} onClick={() => setFilter(null)}>
              {t('notes.filterAll')}
            </button>
            {options.map((o) => (
              <button
                key={o.exerciseId}
                type="button"
                aria-pressed={filter === o.exerciseId}
                title={o.name}
                className={chip(filter === o.exerciseId)}
                onClick={() => setFilter(o.exerciseId)}
              >
                {o.name}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-500">{t('common.error')}</p>}

        {notes === null ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
        ) : days.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filter !== null ? t('notes.emptyFiltered') : t('notes.empty')}
          </p>
        ) : (
          days.map((d) => (
            <div key={d.day} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase text-slate-400">
                {shortDate(d.notes[0].created_at)} · {renderRelative(relativeDate(d.notes[0].created_at, now), t)}
              </h2>
              {d.notes.map((n) => (
                <div key={n.id} className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
                  {/* break-words so an unbroken URL or a 60-character word cannot push the
                      card wider than a 390px screen. */}
                  <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
                  {n.exerciseIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {n.exerciseIds.map((id) => (
                        <span key={id} className="max-w-full break-words rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold dark:bg-[#0f1115]">
                          {names[id] ?? '—'}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-3 text-xs font-semibold">
                    <span className="text-slate-400">{timeOfDay(n.created_at)}</span>
                    <button type="button" disabled={busyId === n.id} onClick={() => setEditing(n)} className="text-brand-700 disabled:opacity-50 dark:text-brand-400">
                      {t('notes.edit')}
                    </button>
                    <button type="button" disabled={busyId === n.id} onClick={() => setPendingDelete(n)} className="text-red-500 disabled:opacity-50">
                      {t('notes.delete')}
                    </button>
                  </div>
                  {rowError === n.id && <p className="mt-2 text-xs text-red-500">{t('common.error')}</p>}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {creating && (
        <NoteEditorSheet
          userId={userId}
          onSaved={async () => { await load(); setCreating(false) }}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <NoteEditorSheet
          userId={userId}
          note={editing}
          onSaved={async () => { await load(); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
      {pendingDelete && (
        <ConfirmModal
          body={t('notes.deleteConfirm')}
          confirmLabel={t('notes.delete')}
          cancelLabel={t('exercises.cancel')}
          danger
          onConfirm={() => { void confirmDelete(pendingDelete) }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
