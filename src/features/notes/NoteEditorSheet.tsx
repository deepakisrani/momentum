import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { createNote, updateNote, type NoteWithTags } from '../../data/noteRepo'
import { getExercisesByIds } from '../../data/exerciseRepo'
import { ExercisePickerSheet } from '../mesos/ExercisePickerSheet'

/** Create/edit a note in a bottom sheet, shared by both entry points. `note` present = edit;
 * otherwise create with `sessionId` (the live workout, or null) and `initialExerciseIds`
 * pre-tagged.
 *
 * Two structural details are load-bearing:
 *
 * 1. The picker is rendered as a **sibling** of the backdrop, not inside it. The backdrop is
 *    click-to-close, so a picker nested inside it would route every click in the picker —
 *    including picking an exercise, and including clicks on the picker's own backdrop —
 *    up to `onClose`, throwing away the body the user just typed. Siblings share no
 *    ancestor, so nothing in the picker can bubble to the backdrop. Being later in the DOM
 *    also puts it above the sheet at equal z-index.
 * 2. The backdrop closes on `e.target === e.currentTarget` *and* only when the gesture also
 *    started there. Selecting text in the textarea and releasing the mouse over the backdrop
 *    dispatches a `click` at their common ancestor — the backdrop itself — so the target
 *    check alone would discard the note on a stray text selection. */
export function NoteEditorSheet({
  userId, note, sessionId = null, initialExerciseIds = [], onSaved, onClose,
}: {
  userId: string
  note?: NoteWithTags
  sessionId?: string | null
  initialExerciseIds?: string[]
  onSaved: () => void | Promise<void>
  onClose: () => void
}) {
  const t = useT()
  useBodyScrollLock()
  const [body, setBody] = useState(note?.body ?? '')
  // Held as state, not recomputed, so the effect below runs exactly once: every tag added
  // afterwards arrives from the picker with its name already in hand.
  const [initialTagIds] = useState<string[]>(() => note?.exerciseIds ?? initialExerciseIds)
  const [tags, setTags] = useState<string[]>(initialTagIds)
  const [names, setNames] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gestureStartedOnBackdrop = useRef(false)

  // One call for the whole pre-tagged set — never one per chip.
  useEffect(() => {
    if (!initialTagIds.length) return
    let ignore = false
    getExercisesByIds(initialTagIds)
      .then((byId) => {
        if (ignore) return
        setNames((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(byId).map(([id, ex]) => [id, ex.name])) }))
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.error('[Notes] tag names failed:', err)
        // Fall back to the same dash noteFormat uses, rather than leaving a permanent
        // spinner glyph on a chip whose name is never coming.
        if (!ignore) setNames((prev) => ({ ...prev, ...Object.fromEntries(initialTagIds.map((id) => [id, '—'])) }))
      })
    return () => { ignore = true }
  }, [initialTagIds])

  async function save() {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      if (note) await updateNote(note.id, { body, exerciseIds: tags })
      else await createNote(userId, { body, sessionId, exerciseIds: tags })
      await onSaved()
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Notes] save failed:', err)
      setError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const canSave = body.trim().length > 0

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex flex-col bg-black/40"
        onMouseDown={(e) => { gestureStartedOnBackdrop.current = e.target === e.currentTarget }}
        onClick={(e) => { if (e.target === e.currentTarget && gestureStartedOnBackdrop.current) onClose() }}
      >
        <div className="mt-auto max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white sm:mx-auto sm:max-w-2xl sm:rounded-b-2xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{note ? t('notes.edit') : t('notes.new')}</h2>
            <button type="button" onClick={onClose} className="shrink-0 text-sm text-slate-500 dark:text-slate-400">
              {t('exercises.cancel')}
            </button>
          </div>

          <textarea
            autoFocus
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('notes.placeholder')}
            aria-label={t('notes.title')}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {tags.length === 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">{t('notes.noTags')}</span>
            )}
            {tags.map((id) => {
              const label = names[id] ?? '…'
              return (
                <span key={id} className="flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold dark:bg-[#1b2030]">
                  {/* min-w-0 + truncate so a long custom exercise name cannot push the ✕ off a
                      narrow screen; the full name stays available via the title attribute. */}
                  <span className="min-w-0 truncate" title={label}>{label}</span>
                  <button
                    type="button"
                    onClick={() => setTags((ts) => ts.filter((x) => x !== id))}
                    aria-label={`${t('notes.removeTag')}: ${label}`}
                    className="shrink-0 text-slate-400"
                  >
                    ✕
                  </button>
                </span>
              )
            })}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-[#1b2030] dark:text-brand-400"
            >
              + {t('notes.addExercise')}
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={save}
            disabled={busy || !canSave}
            className="mt-4 w-full rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {/* Sibling of the backdrop — see the note on this component. It also covers the whole
          sheet, so the editor cannot be dismissed while it is open; that ordering matters,
          because useBodyScrollLock captures the overflow it found on mount and unwinding the
          two locks out of order would leave the page permanently unscrollable. */}
      {pickerOpen && (
        <ExercisePickerSheet
          onPick={(ex) => {
            setPickerOpen(false)
            setNames((m) => ({ ...m, [ex.id]: ex.name }))
            setTags((ts) => (ts.includes(ex.id) ? ts : [...ts, ex.id]))
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}
