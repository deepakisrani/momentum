import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

/** Reusable in-app confirm dialog (replaces window.confirm). Overlay tap = cancel. */
export function ConfirmModal({ title, body, confirmLabel, cancelLabel, onConfirm, onCancel, danger = false }: {
  title?: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}) {
  useBodyScrollLock()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onCancel}>
      <div className="w-full max-w-xs space-y-4 rounded-2xl bg-white p-5 text-slate-900 dark:bg-[#1b2030] dark:text-white" onClick={(e) => e.stopPropagation()}>
        {title && <h2 className="text-lg font-bold">{title}</h2>}
        <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{body}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold dark:bg-[#0f1115]">{cancelLabel}</button>
          <button onClick={onConfirm} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-700 hover:bg-brand-800'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
