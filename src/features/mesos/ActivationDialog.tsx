import { useRef } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'

/** The three-way choice when activating a meso that already has logged sessions.
 *
 * Two buttons cannot express this, which is why it is not a `ConfirmModal`. "Start fresh
 * run? / Cancel" breaks the exact case the dialog exists for: with a meso four sessions into
 * a block, an accidental switch away and back leaves the user choosing between resetting
 * their deload cadence (confirm) and leaving the wrong meso active (cancel). Resume is the
 * third outcome, and it is the important one.
 *
 * Backdrop dismissal requires the gesture to have started on the backdrop, the same guard
 * NoteEditorSheet and LogWeightModal carry: a drag beginning inside the card and ending
 * outside dispatches `click` at their common ancestor -- the backdrop -- without ever
 * traversing the card, so the card's stopPropagation cannot see it. */
export function ActivationDialog({ mesoName, busy, onFreshRun, onResume, onCancel }: {
  mesoName: string
  /** Set once a choice is in flight. Disables all three buttons *and* backdrop dismissal, so
   * a double tap cannot activate twice or cancel a switch that is already happening. */
  busy: boolean
  onFreshRun: () => void
  onResume: () => void
  onCancel: () => void
}) {
  const t = useT()
  useBodyScrollLock()
  const gestureStartedOnBackdrop = useRef(false)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => { gestureStartedOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && gestureStartedOnBackdrop.current && !busy) onCancel() }}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 text-slate-900 dark:bg-[#1b2030] dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold">{t('mesos.activateTitle')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{mesoName}</p>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('mesos.activateBody')}</p>
        <div className="space-y-2">
          <button type="button" disabled={busy} onClick={onFreshRun} className="w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
            {t('mesos.activateFresh')}
          </button>
          <button type="button" disabled={busy} onClick={onResume} className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold disabled:opacity-60 dark:bg-[#0f1115]">
            {t('mesos.activateResume')}
          </button>
          <button type="button" disabled={busy} onClick={onCancel} className="w-full px-4 py-2 text-sm font-semibold text-slate-500 disabled:opacity-60 dark:text-slate-400">
            {t('exercises.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
