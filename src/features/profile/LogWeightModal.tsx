import { useRef, useState } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { useUnits } from './useUnits'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { addWeight } from '../../data/weightRepo'
import { WeightWheel } from '../../components/WeightWheel'
import { todayIso } from './today'

/** Today's weigh-in, on a drum picker. Shared by the Goals page and the dashboard.
 *
 * `initialWeight` is in **display** units (kg or lb) — the caller converts with
 * `u.toWeight`, because only the caller knows which stored row the wheel should open on.
 * The wheel stays in display units throughout; `u.fromWeight` converts once, at the
 * `addWeight` boundary, since `weight_log.weight_kg` is always kg.
 *
 * `addWeight` upserts on `(user_id, logged_on)` (migration 0009), so re-logging today
 * overwrites today's row rather than adding a second one. That makes Save idempotent per
 * day, which is what lets the dashboard button be a one-tap action with no "already logged
 * today" check. */
export function LogWeightModal({ userId, initialWeight, onClose, onSaved }: {
  userId: string
  initialWeight: number
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const t = useT()
  const u = useUnits()
  useBodyScrollLock()
  const [value, setValue] = useState(initialWeight)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Whether the gesture that produced the next click *started* on the backdrop. A drag
  // that begins inside the card and ends outside it dispatches `click` at the two nodes'
  // common ancestor — the backdrop — without ever traversing the card, so the card's
  // stopPropagation cannot see it. The wheel is a 200px scroller of selectable text
  // filling most of this card, which makes that drag easy to perform by accident.
  const gestureStartedOnBackdrop = useRef(false)

  async function save() {
    setBusy(true); setError(null)
    try {
      await addWeight(userId, todayIso(), u.fromWeight(value))
      await onSaved()
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Metrics] logWeight failed:', err)
      setError(t('common.error'))
    } finally { setBusy(false) }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => { gestureStartedOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && gestureStartedOnBackdrop.current) onClose() }}
    >
      {/* Same guard as NoteEditorSheet: close only when the click both lands on the backdrop
          and began there. stopPropagation on the card is not enough on its own — see the ref. */}
      <div className="w-full max-w-xs space-y-4 rounded-2xl bg-white p-5 text-slate-900 dark:bg-[#1b2030] dark:text-white" onClick={(e) => e.stopPropagation()}>
        {/* The unit belongs in the heading, because the wheel only shows it in its drum branch:
            tapping "Type value" replaces the drum, its `{unitLabel}` line and its hint with a
            bare number field. The two page call sites survive that — their own visible text
            reads "Weight (kg)" — but this card's only other text is the heading, so without it
            here the user types a bodyweight with no unit anywhere on screen. The old modal
            carried it as the input's placeholder. */}
        <h2 className="text-lg font-bold">{t('metrics.logWeight')} ({u.weightLabel})</h2>
        {/* `autoFocus` because opening this modal destroys the button that opened it: without it
            focus falls to the document body, and with no focus trap in any modal in this app
            that means a keyboard user tabs in from the top of the page behind. */}
        <WeightWheel value={value} onChange={setValue} unitLabel={u.weightLabel} label={t('metrics.weightWheelLabel')} autoFocus />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          {/* `type="button"` on both: inert on today's two call sites, but this is a shared
              component now, and a caller that rendered it inside a <form> would otherwise have
              Cancel and Save both submit that form. The wheel's own toggles already declare it. */}
          <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold dark:bg-[#0f1115]">{t('exercises.cancel')}</button>
          <button type="button" onClick={save} disabled={busy} className="flex-1 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </div>
    </div>
  )
}
