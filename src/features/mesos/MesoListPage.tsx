import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { listMesos, setActiveMeso, deleteMeso, getMesoFull, saveMeso } from '../../data/mesoRepo'
import { draftFromFull, stripIds } from './mesoDraft'
import type { MesoRow } from '../../data/rows'

export function MesoListPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [mesos, setMesos] = useState<MesoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      setMesos(await listMesos(userId))
      setError(null)
    } catch (e) {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function activate(id: string) {
    setBusy(true)
    try { await setActiveMeso(userId, id); await reload() } catch { setError(t('common.error')) } finally { setBusy(false) }
  }

  async function remove(id: string) {
    if (!window.confirm(t('mesos.deleteConfirm'))) return
    setBusy(true)
    try { await deleteMeso(id); await reload() } finally { setBusy(false) }
  }

  async function duplicate(id: string) {
    setBusy(true)
    try {
      const full = await getMesoFull(id)
      const draft = stripIds(draftFromFull(full))
      draft.name = full.meso.name + t('mesos.copySuffix')
      const newId = await saveMeso(userId, draft)
      navigate(`/mesos/${newId}/edit`)
    } catch { setError(t('common.error')) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex justify-end">
          <Link to="/mesos/new" className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800">{t('mesos.new')}</Link>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
        ) : mesos.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('mesos.empty')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {mesos.map((m) => (
              <li key={m.id} className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{m.name}</span>
                  {m.is_active && <span className="rounded bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">{t('mesos.active')}</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <Link to={`/mesos/${m.id}/edit`} className="rounded-lg bg-white px-3 py-1.5 font-medium dark:bg-[#0f1115]">{t('mesos.edit')}</Link>
                  {!m.is_active && <button disabled={busy} onClick={() => activate(m.id)} className="rounded-lg bg-brand-700 px-3 py-1.5 font-medium text-white hover:bg-brand-800 disabled:opacity-60">{t('mesos.activate')}</button>}
                  <button disabled={busy} onClick={() => duplicate(m.id)} className="rounded-lg bg-white px-3 py-1.5 font-medium dark:bg-[#0f1115]">{t('mesos.duplicate')}</button>
                  <button disabled={busy} onClick={() => remove(m.id)} className="rounded-lg px-3 py-1.5 font-medium text-red-500">{t('mesos.delete')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
