import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { getActiveMeso, getMesoFull } from '../../data/mesoRepo'
import { listMesoSessions, type SessionSummary } from '../../data/sessionRepo'
import { getMesoSetRows } from '../../data/exportRepo'
import { mesoRowsToCsv } from './mesoCsv'
import { downloadTextFile } from '../../lib/download'
import { useUnits } from '../profile/useUnits'
import type { MesoRow } from '../../data/rows'
import { shortDate, localIsoDate } from './historyFormat'

export function HistoryPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const { weightLabel, toWeight } = useUnits()
  const [meso, setMeso] = useState<MesoRow | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [dayLabels, setDayLabels] = useState<Record<string, string>>({})
  const [hasMeso, setHasMeso] = useState(true)
  const [error, setError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)

  useEffect(() => {
    (async () => {
      const m = await getActiveMeso(userId)
      if (!m) { setHasMeso(false); setSessions([]); return }
      setMeso(m)
      const [full, list] = await Promise.all([getMesoFull(m.id), listMesoSessions(userId, m.id)])
      setDayLabels(Object.fromEntries(full.days.map((d) => [d.id, d.label])))
      setSessions(list)
    })().catch(() => { setError(true); setSessions([]) })
  }, [userId])

  async function onExport() {
    if (!meso) return
    setExporting(true)
    setExportError(false)
    try {
      const rows = await getMesoSetRows(userId, meso.id)
      const csv = mesoRowsToCsv(rows, weightLabel, toWeight, localIsoDate)
      const slug = meso.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'meso'
      const date = new Date().toISOString().slice(0, 10)
      downloadTextFile(`momentum-${slug}-${date}.csv`, csv)
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  if (sessions === null) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-4xl space-y-2">
        {error ? (
          <p className="text-sm text-red-500">{t('common.error')}</p>
        ) : !hasMeso ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.noActiveMeso')}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.empty')}</p>
        ) : (
          <>
            <div className="flex items-center justify-end gap-2">
              {exportError && <span className="text-xs text-red-500">{t('common.error')}</span>}
              <button
                onClick={onExport}
                disabled={exporting}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 dark:bg-[#1b2030]"
              >
                {exporting ? t('history.exporting') : t('history.exportCsv')}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/history/${s.id}`)}
                className="flex w-full items-center justify-between rounded-xl bg-slate-100 px-4 py-3 text-left dark:bg-[#1b2030]"
              >
                <div>
                  <div className="font-semibold">{s.meso_day_id ? dayLabels[s.meso_day_id] ?? '—' : '—'}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{shortDate(s.started_at)} · {s.exerciseCount} {t('history.exercises')}</div>
                </div>
                {s.is_deload && (
                  <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{t('history.deload')}</span>
                )}
              </button>
            ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
