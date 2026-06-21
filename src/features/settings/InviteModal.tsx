import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { listInvites, addInvite, removeInvite, type InviteRow } from '../../data/inviteRepo'

export function InviteModal({ onClose, ownerEmail }: { onClose: () => void; ownerEmail: string }) {
  const t = useT()
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try { setInvites(await listInvites()); setError(null) } catch { setError(t('common.error')) }
  }
  useEffect(() => { void load() }, [])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true); setError(null)
    try { await addInvite(email); setEmail(''); await load() }
    catch (err) { if (import.meta.env.DEV) console.error('[Invite] add failed:', err); setError(t('common.error')) }
    finally { setBusy(false) }
  }

  async function remove(target: string) {
    setBusy(true); setError(null)
    try { await removeInvite(target); await load() }
    catch (err) { if (import.meta.env.DEV) console.error('[Invite] remove failed:', err); setError(t('common.error')) }
    finally { setBusy(false) }
  }

  const field = 'flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#0f1115] dark:text-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 text-slate-900 dark:bg-[#1b2030] dark:text-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('invite.title')}</h2>
          <button onClick={onClose} className="text-sm text-slate-500 dark:text-slate-400">{t('exercises.cancel')}</button>
        </div>
        <form onSubmit={add} className="flex gap-2">
          <input className={field} type="email" inputMode="email" autoComplete="off" placeholder={t('invite.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" disabled={busy} className="rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{busy ? t('common.saving') : t('invite.add')}</button>
        </form>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {invites.length === 0 && <li className="text-sm text-slate-500 dark:text-slate-400">{t('invite.empty')}</li>}
          {invites.map((i) => (
            <li key={i.email} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-[#0f1115]">
              <span className="truncate">{i.email}</span>
              <button onClick={() => remove(i.email)} disabled={busy || i.email === ownerEmail} aria-label={t('invite.remove')} className="ml-2 shrink-0 text-red-500 disabled:opacity-30">✕</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
