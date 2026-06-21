import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from '../profile/useProfileData'
import { getActiveMeso, getMesoFull, getMesoDayTargets } from '../../data/mesoRepo'
import { getActiveSession, startSession, getSessionFull, endSession, setSessionDeload, addSessionExercise, getLastSessionDateByDay, type SessionFull } from '../../data/sessionRepo'
import { listExercises } from '../../data/exerciseRepo'
import type { ExerciseRow, MesoRow } from '../../data/rows'
import type { MesoFull } from '../mesos/mesoDraft'
import { useElapsed } from './useElapsed'
import { exerciseStatus } from './sessionFormat'
import { ExerciseLogPanel } from './ExerciseLogPanel'
import { ExercisePickerSheet } from '../mesos/ExercisePickerSheet'

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
  const [lastDates, setLastDates] = useState<Record<string, string>>({})

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
          setLastDates(await getLastSessionDateByDay(userId, meso.id))
        }
        if (existing) { setSessionId(existing.id); await loadSession(existing.id) }
      } finally {
        setLoading(false)
      }
    })()
  }, [userId, loadSession])

  async function start(mesoDayId: string, isDeload: boolean) {
    setBusy(true)
    try {
      const id = await startSession(userId, { mesoId: activeMeso?.id ?? null, mesoDayId, isDeload })
      setSessionId(id)
      await loadSession(id)
    } finally { setBusy(false) }
  }

  async function end() {
    if (!sessionId) return
    setBusy(true)
    try { await endSession(sessionId); navigate('/') } finally { setBusy(false) }
  }

  async function toggleDeload() {
    if (!full || !sessionId) return
    const next = !full.session.is_deload
    try {
      await setSessionDeload(sessionId, next)
      setFull({ ...full, session: { ...full.session, is_deload: next } })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Workout] toggleDeload failed:', err)
    }
  }

  async function addExercise(ex: ExerciseRow) {
    if (!sessionId || !full) return
    setExMap((m) => ({ ...m, [ex.id]: ex }))
    try {
      await addSessionExercise(sessionId, ex.id, full.exercises.length, 'added')
      await loadSession(sessionId)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Workout] addExercise failed:', err)
    } finally {
      setPickerOpen(false)
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

  if (loading) return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>

  // No active session: show the start chooser.
  if (!full) {
    return (
      <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
        <div className="mx-auto max-w-md space-y-4">
          {!activeMeso || !mesoFull ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('workout.noActiveMeso')}</p>
          ) : (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">{activeMeso.name}</p>
              <ul className="space-y-2">
                {mesoFull.days.map((d) => (
                  <li key={d.id}>
                    <button disabled={busy} onClick={() => start(d.id, false)} className="w-full rounded-lg bg-brand-700 px-4 py-3 text-left font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
                      <div>{d.label}</div>
                      {lastDates[d.id] && (
                        <div className="text-xs font-normal opacity-80">{t('workout.lastWorkout')}: {fmtDate(lastDates[d.id])}</div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    )
  }

  // Active session: overview + per-exercise accordion.
  return (
    <div className="min-h-screen bg-white pb-24 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <Header startIso={full.session.started_at} isDeload={full.session.is_deload} onEnd={end} onToggleDeload={toggleDeload} busy={busy} />
      <div className="mx-auto max-w-md space-y-3 p-6">
        {full.exercises.map((se) => {
          const ex = exMap[se.exercise_id]
          const target = targets[se.exercise_id] ?? { targetSets: 3, repMin: 8, repMax: 12 }
          const status = exerciseStatus(target.targetSets, se.sets.length)
          const open = expanded === se.id
          return (
            <div key={se.id} className="rounded-xl bg-slate-100 dark:bg-[#1b2030]">
              <button onClick={() => setExpanded(open ? null : se.id)} className="flex w-full items-center justify-between p-4 text-left">
                <span className="font-semibold">{ex?.name ?? '…'}</span>
                <span className={`text-xs ${status === 'done' ? 'text-brand-green' : status === 'in_progress' ? 'text-brand-500' : 'text-slate-400'}`}>
                  {se.sets.length}/{target.targetSets} · {t(`workout.status.${status}`)}
                </span>
              </button>
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
      {pickerOpen && <ExercisePickerSheet onPick={addExercise} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}

function Header({ startIso, isDeload, onEnd, onToggleDeload, busy }: { startIso: string; isDeload: boolean; onEnd: () => void; onToggleDeload: () => void; busy: boolean }) {
  const t = useT()
  const elapsed = useElapsed(startIso)
  return (
    <div className="bg-gradient-to-r from-brand-700 to-brand-600 p-4 text-white">
      <div className="mx-auto flex max-w-md items-center justify-between">
        <div>
          <div className="text-xs opacity-85">{t('workout.inProgress')}</div>
          <div className="text-2xl font-bold tabular-nums">{elapsed}</div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onToggleDeload} className={`rounded-lg px-2 py-1 text-xs font-semibold ${isDeload ? 'bg-white text-brand-700' : 'bg-white/20'}`}>
            🌙 {t('workout.deload')}
          </button>
          <button disabled={busy} onClick={onEnd} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 disabled:opacity-60">{t('workout.end')}</button>
        </div>
      </div>
    </div>
  )
}
