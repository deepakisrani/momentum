import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from '../profile/useProfileData'
import { getActiveMeso, getMesoFull, getMesoDayTargets } from '../../data/mesoRepo'
import { getActiveSession, startSession, getSessionFull, endSession, setSessionDeload, addSessionExercise, removeSessionExercise, getMesoDayStats, type SessionFull } from '../../data/sessionRepo'
import { isDeloadDue } from '../../domain/scheduling'
import { listExercises } from '../../data/exerciseRepo'
import type { ExerciseRow, MesoRow } from '../../data/rows'
import type { MesoFull } from '../mesos/mesoDraft'
import { useElapsed } from './useElapsed'
import { exerciseStatus } from './sessionFormat'
import { ExerciseLogPanel } from './ExerciseLogPanel'
import { ExercisePickerSheet } from '../mesos/ExercisePickerSheet'
import { PreviousWorkoutPanel } from '../history/PreviousWorkoutPanel'
import { ConfirmModal } from '../../components/ConfirmModal'

export function ActiveWorkoutPage() {
  const t = useT()
  const navigate = useNavigate()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const { latestGoal } = useProfileData()

  const [activeMeso, setActiveMeso] = useState<MesoRow | null>(null)
  const [mesoFull, setMesoFull] = useState<MesoFull | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [full, setFull] = useState<SessionFull | null>(null)
  const [targets, setTargets] = useState<Record<string, { targetSets: number; repMin: number; repMax: number }>>({})
  const [exMap, setExMap] = useState<Record<string, ExerciseRow>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dayStats, setDayStats] = useState<Record<string, { lastDate: string | null; sinceLastDeload: number }>>({})
  const [toggling, setToggling] = useState(false)
  const [pendingAdd, setPendingAdd] = useState<ExerciseRow | null>(null)
  const [endPrompt, setEndPrompt] = useState(false)
  const [endPrompted, setEndPrompted] = useState(false)

  const loadSession = useCallback(async (id: string) => {
    const f = await getSessionFull(id)
    setFull(f)
    if (f.session.meso_day_id) setTargets(await getMesoDayTargets(f.session.meso_day_id))
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const [meso, exList, existing] = await Promise.all([getActiveMeso(userId), listExercises(), getActiveSession(userId)])
        setActiveMeso(meso)
        setExMap(Object.fromEntries(exList.map((e) => [e.id, e])))
        if (meso) {
          setMesoFull(await getMesoFull(meso.id))
          setDayStats(await getMesoDayStats(userId, meso.id))
        }
        if (existing) { setSessionId(existing.id); await loadSession(existing.id) }
      } finally {
        setLoading(false)
      }
    })()
  }, [userId, loadSession])

  // When every exercise has hit all its sets, prompt to end — once per session.
  // (Zero-set exercises count as not-done, so a deliberately-skipped one won't trigger it.)
  useEffect(() => {
    if (!full || !sessionId || endPrompted) return
    const exs = full.exercises
    if (exs.length === 0) return
    const allDone = exs.every((se) => se.sets.length >= (targets[se.exercise_id]?.targetSets ?? 3))
    if (allDone) { setEndPrompt(true); setEndPrompted(true) }
  }, [full, targets, sessionId, endPrompted])

  async function start(mesoDayId: string, isDeload: boolean) {
    setBusy(true)
    try {
      const id = await startSession(userId, { mesoId: activeMeso?.id ?? null, mesoDayId, isDeload })
      setSessionId(id)
      setEndPrompted(false)
      await loadSession(id)
    } finally { setBusy(false) }
  }

  async function end() {
    if (!sessionId) return
    setBusy(true)
    try { await endSession(sessionId); navigate('/') } finally { setBusy(false) }
  }

  async function toggleDeload() {
    if (!full || !sessionId || toggling) return
    setToggling(true)
    const next = !full.session.is_deload
    try {
      await setSessionDeload(sessionId, next)
      setFull({ ...full, session: { ...full.session, is_deload: next } })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Workout] toggleDeload failed:', err)
    } finally {
      setToggling(false)
    }
  }

  async function addExercise(ex: ExerciseRow) {
    if (!sessionId || !full) return
    try {
      await addSessionExercise(sessionId, ex.id, full.exercises.length, 'added')
      setExMap((m) => ({ ...m, [ex.id]: ex }))
      await loadSession(sessionId)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Workout] addExercise failed:', err)
    }
  }

  async function removeExercise(sessionExerciseId: string) {
    if (!sessionId) return
    try {
      await removeSessionExercise(sessionExerciseId)
      await loadSession(sessionId)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Workout] removeExercise failed:', err)
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

  if (loading) return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>

  // No active session: show the start chooser.
  if (!full) {
    return (
      <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
        <div className="mx-auto max-w-lg space-y-4">
          {!activeMeso || !mesoFull ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('workout.noActiveMeso')}</p>
          ) : (
            <>
              <h1 className="text-2xl font-bold">{activeMeso.name}</h1>
              <ul className="space-y-2">
                {mesoFull.days.map((d) => {
                  const stat = dayStats[d.id]
                  const deloadDue = isDeloadDue(stat?.sinceLastDeload ?? 0, activeMeso.deload_every_n_microcycles)
                  return (
                    <li key={d.id}>
                      <button disabled={busy} onClick={() => start(d.id, deloadDue)} className="w-full rounded-lg bg-brand-700 px-4 py-3 text-left font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
                        <div className="flex items-center justify-between gap-2">
                          <span>{d.label}</span>
                          {deloadDue && <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{t('workout.deloadScheduled')}</span>}
                        </div>
                        {stat?.lastDate && (
                          <div className="text-xs font-normal opacity-80">{t('workout.lastWorkout')}: {fmtDate(stat.lastDate)}</div>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    )
  }

  // Active session: overview + per-exercise accordion.
  const dayLabel = mesoFull?.days.find((d) => d.id === full.session.meso_day_id)?.label ?? ''
  return (
    <div className="min-h-screen bg-white pb-24 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <Header startIso={full.session.started_at} isDeload={full.session.is_deload} onEnd={end} onToggleDeload={toggleDeload} busy={busy} />
      <div className="mx-auto max-w-lg space-y-3 p-6">
        {full.session.is_deload && (
          <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-[#1b2030] dark:text-brand-400">
            {t('workout.deloadBanner')}
          </div>
        )}
        {full.session.meso_id && full.session.meso_day_id && (
          <button onClick={() => setHistoryOpen(true)} className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-brand-700 dark:bg-[#1b2030] dark:text-brand-400">
            {t('workout.previous')}
          </button>
        )}
        {full.exercises.map((se) => {
          const ex = exMap[se.exercise_id]
          const target = targets[se.exercise_id] ?? { targetSets: 3, repMin: 8, repMax: 12 }
          const status = exerciseStatus(target.targetSets, se.sets.length)
          const open = expanded === se.id
          return (
            <div key={se.id} className={`relative overflow-hidden rounded-xl bg-slate-100 dark:bg-[#1b2030] ${status === 'done' ? 'ring-1 ring-brand-green/60' : ''}`}>
              {status === 'done' && (
                <div className="animate-done-flash pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-brand-green text-sm font-bold uppercase tracking-wide text-white">
                  {t('workout.exerciseDone')}
                </div>
              )}
              <div className="flex items-center">
                <button onClick={() => setExpanded(open ? null : se.id)} className="flex flex-1 items-center justify-between p-4 text-left">
                  <span className="font-semibold">{ex?.name ?? '…'}</span>
                  <span className={`text-xs ${status === 'done' ? 'text-brand-green' : status === 'in_progress' ? 'text-brand-500' : 'text-slate-400'}`}>
                    {se.sets.length}/{target.targetSets} · {t(`workout.status.${status}`)}
                  </span>
                </button>
                {se.sets.length === 0 && (
                  <button onClick={() => removeExercise(se.id)} aria-label={t('workout.removeExercise')} className="shrink-0 px-3 text-lg leading-none text-slate-400 hover:text-red-500">✕</button>
                )}
              </div>
              {open && (
                <ExerciseLogPanel
                  userId={userId}
                  sessionId={full.session.id}
                  isDeload={full.session.is_deload}
                  goal={latestGoal?.goal ?? 'maintain'}
                  sessionExercise={se}
                  exercise={ex}
                  target={target}
                  onChanged={() => loadSession(full.session.id)}
                />
              )}
            </div>
          )
        })}
        <button onClick={() => setPickerOpen(true)} className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-brand-700 dark:bg-[#1b2030] dark:text-brand-400">
          {t('workout.addExercise')}
        </button>
      </div>
      {pickerOpen && <ExercisePickerSheet onPick={(ex) => { setPickerOpen(false); setPendingAdd(ex) }} onClose={() => setPickerOpen(false)} />}
      {pendingAdd && (
        <ConfirmModal
          title={pendingAdd.name}
          body={t('workout.addConfirm')}
          confirmLabel={t('workout.add')}
          cancelLabel={t('exercises.cancel')}
          onConfirm={() => { const ex = pendingAdd; setPendingAdd(null); void addExercise(ex) }}
          onCancel={() => setPendingAdd(null)}
        />
      )}
      {endPrompt && (
        <ConfirmModal
          title={t('workout.allSetsDoneTitle')}
          body={t('workout.allSetsDone')}
          confirmLabel={t('workout.endWorkout')}
          cancelLabel={t('workout.keepGoing')}
          onConfirm={() => { setEndPrompt(false); void end() }}
          onCancel={() => setEndPrompt(false)}
        />
      )}
      {historyOpen && full.session.meso_id && full.session.meso_day_id && (
        <PreviousWorkoutPanel
          userId={userId}
          mesoId={full.session.meso_id}
          mesoDayId={full.session.meso_day_id}
          dayLabel={dayLabel}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  )
}

function Header({ startIso, isDeload, onEnd, onToggleDeload, busy }: { startIso: string; isDeload: boolean; onEnd: () => void; onToggleDeload: () => void; busy: boolean }) {
  const t = useT()
  const elapsed = useElapsed(startIso)
  return (
    <div className="bg-gradient-to-r from-brand-700 to-brand-600 p-4 text-white">
      <div className="mx-auto flex max-w-lg items-center justify-between">
        <div>
          <div className="text-xs opacity-90">{t('workout.inProgress')}</div>
          <div className="text-2xl font-bold tabular-nums">{elapsed}</div>
        </div>
        <div className="flex items-center gap-4">
          <button disabled={busy} onClick={onToggleDeload} role="switch" aria-checked={isDeload} className="flex items-center gap-2 text-sm font-semibold disabled:opacity-60">
            {t('workout.deload')}
            <span className={`relative inline-block h-6 w-11 rounded-full transition-colors ${isDeload ? 'bg-white' : 'bg-white/30'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${isDeload ? 'left-[22px] bg-brand-700' : 'left-0.5 bg-white'}`} />
            </span>
          </button>
          <button disabled={busy} onClick={onEnd} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white hover:bg-red-700 disabled:opacity-60">
            {t('workout.end')}
          </button>
        </div>
      </div>
    </div>
  )
}
