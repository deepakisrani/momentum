import { useEffect, useMemo, useState } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { addSet, updateSegment, deleteSet, getLastPerformance, type SessionExerciseFull } from '../../data/sessionRepo'
import type { ExerciseRow } from '../../data/rows'
import type { Goal, SetResult } from '../../domain/types'
import { suggestNextSetOne } from '../../domain/suggestion'
import { formatLastTime, buildSuggestionInput } from './sessionFormat'
import { useUnits } from '../profile/useUnits'

type Target = { targetSets: number; repMin: number; repMax: number }

export function ExerciseLogPanel({
  userId, sessionId, isDeload, goal, sessionExercise, exercise, target, onChanged,
}: {
  userId: string
  sessionId: string
  isDeload: boolean
  goal: Goal
  sessionExercise: SessionExerciseFull
  exercise: ExerciseRow | undefined
  target: Target
  onChanged: () => Promise<void> | void
}) {
  const t = useT()
  const u = useUnits()
  const [last, setLast] = useState<SetResult[] | null>(null)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [rir, setRir] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getLastPerformance(userId, sessionExercise.exercise_id, sessionId).then(setLast).catch(() => setLast(null))
  }, [userId, sessionExercise.exercise_id, sessionId])

  const suggestion = useMemo(() => {
    const input = buildSuggestionInput({ last, target: { repMin: target.repMin, repMax: target.repMax }, goal, mechanic: exercise?.mechanic ?? null, isDeload })
    return suggestNextSetOne(input)
  }, [last, target, goal, exercise, isDeload])

  const completed = sessionExercise.sets
  // Prefill: Set 1 from the suggestion; later sets from the last completed set this session.
  useEffect(() => {
    if (weight !== '' || reps !== '') return
    if (completed.length === 0 && suggestion) {
      setWeight(String(u.toWeight(suggestion.weight)))
      setReps(String(suggestion.repTarget))
    } else if (completed.length > 0) {
      const lastSeg = completed[completed.length - 1].segments[0]
      if (lastSeg) setWeight(String(u.toWeight(lastSeg.weight)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion, completed.length])

  async function logSet() {
    if (weight === '' || reps === '') return
    setBusy(true)
    try {
      await addSet(sessionExercise.id, completed.length, { weight: u.fromWeight(Number(weight)), reps: Number(reps), rir: rir === '' ? null : Number(rir) })
      setRir('')
      await onChanged()
    } finally { setBusy(false) }
  }

  const lastDisplay = last ? last.map((s) => ({ ...s, weight: u.toWeight(s.weight) })) : null
  const lastLine = formatLastTime(lastDisplay)
  const numField = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-center text-slate-900 dark:border-slate-700 dark:bg-[#0f1115] dark:text-white'

  return (
    <div className="space-y-3 px-4 pb-4">
      {lastLine && (
        <div className="rounded-lg border-l-2 border-brand-600 bg-white px-3 py-2 text-sm dark:bg-[#0f1115]">
          <span className="text-xs uppercase text-slate-400">{t('workout.lastTime')} ({u.weightLabel})</span>
          <div className="font-medium">{lastLine}</div>
        </div>
      )}

      {/* logged sets */}
      <ul className="space-y-1">
        {completed.map((s, i) => {
          const seg = s.segments[0]
          return (
            <li key={s.id} className="grid grid-cols-[24px_1fr_1fr_1fr_28px] items-center gap-2 text-sm">
              <span className="font-semibold">{i + 1}</span>
              <input className={numField} defaultValue={seg ? u.toWeight(seg.weight) : ''} onBlur={(e: React.FocusEvent<HTMLInputElement>) => seg && updateSegment(seg.id, { weight: u.fromWeight(Number(e.target.value)), reps: seg.reps, rir: seg.rir }).then(onChanged)} />
              <input className={numField} defaultValue={seg?.reps} onBlur={(e: React.FocusEvent<HTMLInputElement>) => seg && updateSegment(seg.id, { weight: seg.weight, reps: Number(e.target.value), rir: seg.rir }).then(onChanged)} />
              <input className={numField} defaultValue={seg?.rir ?? ''} placeholder={t('workout.rir')} onBlur={(e: React.FocusEvent<HTMLInputElement>) => seg && updateSegment(seg.id, { weight: seg.weight, reps: seg.reps, rir: e.target.value === '' ? null : Number(e.target.value) }).then(onChanged)} />
              <button onClick={() => deleteSet(s.id).then(onChanged)} aria-label={t('workout.deleteSet')} className="text-slate-400">🗑</button>
            </li>
          )
        })}
      </ul>

      {/* next-set entry */}
      <div className="grid grid-cols-[24px_1fr_1fr_1fr_28px] items-center gap-2 text-sm">
        <span className="font-semibold text-slate-400">{completed.length + 1}</span>
        <input className={numField} inputMode="decimal" placeholder={u.weightLabel} value={weight} onChange={(e) => setWeight(e.target.value)} />
        <input className={numField} inputMode="numeric" placeholder={t('workout.reps')} value={reps} onChange={(e) => setReps(e.target.value)} />
        <input className={numField} inputMode="numeric" placeholder={t('workout.rir')} value={rir} onChange={(e) => setRir(e.target.value)} />
        <span />
      </div>

      {suggestion && completed.length === 0 && (
        <p className="text-xs text-brand-500">💡 {t(`workout.suggestion.${suggestion.reason}`)}</p>
      )}

      <button disabled={busy} onClick={logSet} className="w-full rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
        {t('workout.addSet')}
      </button>
    </div>
  )
}
