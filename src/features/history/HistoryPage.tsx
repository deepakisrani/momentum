import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { listMesosForHistory, getMesoDayLabels } from '../../data/mesoRepo'
import { listMesoSessions, countCompletedSessions, type SessionSummary } from '../../data/sessionRepo'
import { getMesoSetRows } from '../../data/exportRepo'
import { mesoRowsToCsv } from './mesoCsv'
import { downloadTextFile } from '../../lib/download'
import { useUnits } from '../profile/useUnits'
import type { MesoRow } from '../../data/rows'
import { shortDate, localIsoDate } from './historyFormat'
import {
  defaultHistoryScope, historyScopeOptions, scopeKey, splitByRun, type HistoryScope,
} from './historyScope'

/** Filename slug for the unassigned bucket, which has no meso name to slugify. */
const UNASSIGNED_SLUG = 'unassigned'

/** History is scoped by the switcher, never by which meso happens to be active. Before that,
 * creating and activating a new meso made every earlier block unreachable *and* unexportable
 * — the data was still there, but the app could no longer show or hand it back. */
export function HistoryPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const { weightLabel, toWeight } = useUnits()
  const [mesos, setMesos] = useState<MesoRow[] | null>(null)
  const [hasUnassigned, setHasUnassigned] = useState(false)
  const [scope, setScope] = useState<HistoryScope | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [dayLabels, setDayLabels] = useState<Record<string, string>>({})
  const [error, setError] = useState(false)
  const [scopeError, setScopeError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)

  // What the user can look at: every meso including soft-deleted ones (keeping their log
  // readable is the point of soft-deleting), plus whether any workout belongs to no meso.
  // Separate from the sessions load below because it depends only on the user: re-fetching it
  // whenever the scope changes would be wasted work, and setting `scope` from it would then
  // re-trigger itself.
  useEffect(() => {
    if (!userId) return
    let ignore = false
    setError(false)
    ;(async () => {
      const [ms, orphans] = await Promise.all([
        listMesosForHistory(userId),
        countCompletedSessions(userId, null),
      ])
      if (ignore) return
      setMesos(ms)
      setHasUnassigned(orphans > 0)
      setScope(defaultHistoryScope(ms, orphans > 0))
    })().catch(() => { if (!ignore) { setError(true); setMesos([]) } })
    return () => { ignore = true }
  }, [userId])

  // Sessions for the selected scope. Runs only once a scope exists, so mount does not fire a
  // throwaway request; `scope` is only ever set from the effect above or the switcher, so this
  // fires exactly once per selection. The `ignore` flag is what makes overlapping requests
  // safe: React runs the previous cleanup before this body, so a slow response for an
  // abandoned scope can no longer write to state (same guard PreviousWorkoutPanel uses).
  useEffect(() => {
    if (!scope) return
    let ignore = false
    setSessions(null)
    setScopeError(false)
    setExportError(false)
    ;(async () => {
      if (scope.kind === 'unassigned') {
        const list = await listMesoSessions(userId, null)
        // No meso, so no day labels: these sessions lost their meso_day_id long ago.
        if (!ignore) { setDayLabels({}); setSessions(list) }
        return
      }
      // getMesoDayLabels, not getMesoFull: History must see days the user has since removed,
      // or a session logged on one shows no label.
      const [labels, list] = await Promise.all([
        getMesoDayLabels(scope.mesoId),
        listMesoSessions(userId, scope.mesoId),
      ])
      // Set together so no render ever pairs one scope's sessions with another's labels.
      if (!ignore) { setDayLabels(labels); setSessions(list) }
    })().catch(() => { if (!ignore) { setScopeError(true); setSessions([]) } })
    return () => { ignore = true }
  }, [userId, scope])

  const options = useMemo(() => historyScopeOptions(mesos ?? [], hasUnassigned), [mesos, hasUnassigned])
  const selectedMeso = scope?.kind === 'meso'
    ? (mesos ?? []).find((m) => m.id === scope.mesoId) ?? null
    : null
  // Only a meso has runs, and the unassigned bucket has no activated_at, so it is never split.
  // History deliberately does NOT window its query — it shows every run and groups them — which
  // is why the split happens here rather than in the database.
  const runs = splitByRun(sessions ?? [], selectedMeso?.activated_at ?? null)

  async function onExport() {
    if (!scope) return
    setExporting(true)
    setExportError(false)
    try {
      // The export follows the switcher, not the active meso.
      const rows = await getMesoSetRows(userId, scope.kind === 'meso' ? scope.mesoId : null)
      const csv = mesoRowsToCsv(rows, weightLabel, toWeight, localIsoDate)
      const base = selectedMeso?.name ?? UNASSIGNED_SLUG
      const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'meso'
      const date = new Date().toISOString().slice(0, 10)
      downloadTextFile(`momentum-${slug}-${date}.csv`, csv)
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  if (mesos === null) {
    return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>
  }

  // A null scope means there is nothing at all to show — no mesos (deleted ones included) and
  // no orphaned sessions — which is exactly when `options` is empty too. It is no longer "no
  // *active* meso": a user whose mesos are all inactive used to see an empty page and now sees
  // their history.
  const nothingToShow = scope === null
  // Enabled unless we positively know the scope is empty. Not `!sessions`, which would also
  // disable it mid-load and flicker on every switch — the export runs its own query and does
  // not need the list. Left enabled on a failed load too, so a broken list never takes the
  // export path away with it.
  const exportDisabled = exporting || (!scopeError && sessions?.length === 0)
  const control = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white'

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-4xl space-y-3">
        {error ? (
          <p className="text-sm text-red-500">{t('common.error')}</p>
        ) : nothingToShow ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.nothingLogged')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 dark:text-slate-400">{t('history.mesoScope')}</span>
                <select
                  className={control}
                  value={scopeKey(scope)}
                  onChange={(e) => {
                    const next = options.find((o) => o.key === e.target.value)
                    if (next) setScope(next.scope)
                  }}
                >
                  {options.map((o) => (
                    <option key={o.key} value={o.key}>{o.mesoName ?? t('history.unassigned')}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                {exportError && <span className="text-xs text-red-500">{t('common.error')}</span>}
                <button
                  onClick={onExport}
                  disabled={exportDisabled}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 dark:bg-[#1b2030]"
                >
                  {exporting ? t('history.exporting') : t('history.exportCsv')}
                </button>
              </div>
            </div>

            {scopeError ? (
              <p className="text-sm text-red-500">{t('common.error')}</p>
            ) : sessions === null ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('history.emptyScope')}</p>
            ) : (
              <>
                <SessionGrid
                  sessions={runs.current}
                  dayLabels={dayLabels}
                  heading={runs.earlier.length > 0 ? t('history.currentRun') : null}
                  onOpen={(id) => navigate(`/history/${id}`)}
                />
                <SessionGrid
                  sessions={runs.earlier}
                  dayLabels={dayLabels}
                  heading={t('history.earlier')}
                  onOpen={(id) => navigate(`/history/${id}`)}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** One group of session cards, with an optional heading; renders nothing when empty, so the
 * headings appear only where a meso has actually been re-activated and an un-revisited meso
 * looks exactly as it did before this existed. */
function SessionGrid({ sessions, dayLabels, heading, onOpen }: {
  sessions: SessionSummary[]
  dayLabels: Record<string, string>
  heading: string | null
  onOpen: (sessionId: string) => void
}) {
  const t = useT()
  if (sessions.length === 0) return null
  return (
    <div className="space-y-2">
      {heading && <h2 className="text-xs font-semibold uppercase text-slate-400">{heading}</h2>}
      <div className="grid gap-2 sm:grid-cols-2">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpen(s.id)}
            className="flex w-full items-center justify-between rounded-xl bg-slate-100 px-4 py-3 text-left dark:bg-[#1b2030]"
          >
            <div>
              {/* An unassigned session shows "—": its meso_day_id was nulled when the old hard
                  delete cascaded meso_day away, and those rows cannot be recovered. */}
              <div className="font-semibold">{s.meso_day_id ? dayLabels[s.meso_day_id] ?? '—' : '—'}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {shortDate(s.started_at)} · {s.exerciseCount} {t('history.exercises')}
              </div>
            </div>
            {s.is_deload && (
              <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{t('history.deload')}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
