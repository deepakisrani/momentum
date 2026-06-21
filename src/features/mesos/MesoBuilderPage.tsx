import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { getMesoFull, saveMeso, setActiveMeso } from '../../data/mesoRepo'
import { listExercises } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import { blankMeso, draftFromFull, validateMeso, moveItem, type MesoDraft, type DraftDay } from './mesoDraft'
import { ExercisePickerSheet } from './ExercisePickerSheet'

export function MesoBuilderPage() {
  const t = useT()
  const navigate = useNavigate()
  const { id } = useParams()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''

  const [draft, setDraft] = useState<MesoDraft>(blankMeso())
  const [activeDay, setActiveDay] = useState(0)
  const [exMap, setExMap] = useState<Record<string, ExerciseRow>>({})
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [showError, setShowError] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    listExercises().then((list) => setExMap(Object.fromEntries(list.map((e) => [e.id, e])))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    getMesoFull(id)
      .then((full) => setDraft(draftFromFull(full)))
      .catch(() => navigate('/mesos', { replace: true }))
      .finally(() => setLoading(false))
  }, [id])

  const errors = useMemo(() => validateMeso(draft), [draft])

  function update(mut: (d: MesoDraft) => void) {
    setDraft((prev) => { const copy = structuredClone(prev); mut(copy); return copy })
  }

  function addDay() {
    update((d) => d.days.push({ label: t('meso.defaultDayName').replace('{n}', String(d.days.length + 1)), exercises: [] }))
    setActiveDay(draft.days.length)
  }
  function removeDay(i: number) {
    update((d) => d.days.splice(i, 1))
    setActiveDay((a) => Math.max(0, a - (i <= a ? 1 : 0)))
  }
  function moveDay(i: number, dir: -1 | 1) {
    update((d) => { d.days = moveItem(d.days, i, dir) })
    setActiveDay((a) => (a === i ? i + dir : a === i + dir ? i : a))
  }

  function addExercise(ex: ExerciseRow) {
    update((d) => d.days[activeDay].exercises.push({ exerciseId: ex.id, targetSets: 3, repMin: 8, repMax: 12 }))
    setExMap((m) => ({ ...m, [ex.id]: ex }))
    setPickerOpen(false)
  }

  async function save(activate: boolean) {
    if (errors.length) { setShowError(true); return }
    setSaving(true)
    setSaveError(null)
    try {
      const newId = await saveMeso(userId, draft)
      if (activate) {
        await setActiveMeso(userId, newId)
      }
      navigate('/mesos')
    } catch {
      setSaveError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-white p-6 dark:bg-[#0f1115] dark:text-white">{t('common.loading')}</div>

  const day: DraftDay | undefined = draft.days[activeDay]
  const control = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white'
  const numField = 'w-14 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-slate-900 dark:border-slate-700 dark:bg-[#0f1115] dark:text-white'

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-md space-y-4">
        <input className={`${control} w-full text-lg font-bold`} placeholder={t('meso.name')} value={draft.name} onChange={(e) => update((d) => { d.name = e.target.value })} />

        <div className="flex gap-2">
          <label className="w-full text-sm">{t('meso.deloadEvery')}
            <select className={`${control} mt-1 w-full`} value={draft.deloadEveryN ?? 0} onChange={(e) => update((d) => { d.deloadEveryN = Number(e.target.value) || null })}>
              <option value={0}>{t('meso.deloadNever')}</option>
              {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        {/* Day tabs */}
        <div className="flex flex-wrap gap-2">
          {draft.days.map((d, i) => (
            <button key={i} onClick={() => setActiveDay(i)} className={`rounded-full px-3 py-1 text-sm ${i === activeDay ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-[#1b2030]'}`}>
              {d.label || t('meso.defaultDayName').replace('{n}', String(i + 1))}
            </button>
          ))}
          <button onClick={addDay} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-brand-700 dark:bg-[#1b2030] dark:text-brand-400">+ {t('meso.addDay')}</button>
        </div>

        {day && (
          <div className="space-y-3 rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
            <div className="flex items-center gap-2">
              <input className={`${control} min-w-0 flex-1`} placeholder={t('meso.dayLabel')} value={day.label} onChange={(e) => update((d) => { d.days[activeDay].label = e.target.value })} />
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => moveDay(activeDay, -1)} aria-label={t('meso.moveUp')} className="px-1.5">↑</button>
                <button onClick={() => moveDay(activeDay, 1)} aria-label={t('meso.moveDown')} className="px-1.5">↓</button>
                <button onClick={() => removeDay(activeDay)} aria-label={t('meso.removeDay')} className="px-1.5 text-red-500">🗑</button>
              </div>
            </div>

            {day.exercises.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{t('meso.noExercises')}</p>}
            <ul className="space-y-2">
              {day.exercises.map((ex, j) => (
                <li key={j} className="rounded-lg bg-white p-3 dark:bg-[#0f1115]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{exMap[ex.exerciseId]?.name ?? '…'}</span>
                    <div className="flex gap-1 text-slate-500 dark:text-slate-400">
                      <button onClick={() => update((d) => { d.days[activeDay].exercises = moveItem(d.days[activeDay].exercises, j, -1) })} aria-label={t('meso.moveUp')} className="px-1">↑</button>
                      <button onClick={() => update((d) => { d.days[activeDay].exercises = moveItem(d.days[activeDay].exercises, j, 1) })} aria-label={t('meso.moveDown')} className="px-1">↓</button>
                      <button onClick={() => update((d) => { d.days[activeDay].exercises.splice(j, 1) })} aria-label={t('meso.remove')} className="px-1 text-red-500">✕</button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <label className="flex items-center gap-1">{t('meso.sets')}
                      <input className={numField} type="number" min="1" value={ex.targetSets} onChange={(e) => update((d) => { d.days[activeDay].exercises[j].targetSets = Number(e.target.value) })} />
                    </label>
                    <label className="flex items-center gap-1">{t('meso.reps')}
                      <input className={numField} type="number" min="1" value={ex.repMin} onChange={(e) => update((d) => { d.days[activeDay].exercises[j].repMin = Number(e.target.value) })} />
                      <span>–</span>
                      <input className={numField} type="number" min="1" value={ex.repMax} onChange={(e) => update((d) => { d.days[activeDay].exercises[j].repMax = Number(e.target.value) })} />
                    </label>
                  </div>
                </li>
              ))}
            </ul>

            <button onClick={() => setPickerOpen(true)} className="w-full rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800">+ {t('meso.addExercise')}</button>
          </div>
        )}

        {showError && errors.length > 0 && <p className="text-sm text-red-500">{t('meso.invalid')}</p>}
        {saveError && <p className="text-sm text-red-500">{saveError}</p>}

        <div className="flex gap-2">
          <button disabled={saving} onClick={() => save(false)} className="flex-1 rounded-lg bg-slate-200 px-4 py-3 font-semibold text-slate-900 disabled:opacity-60 dark:bg-[#1b2030] dark:text-white">{t('meso.save')}</button>
          <button disabled={saving} onClick={() => save(true)} className="flex-1 rounded-lg bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{t('meso.saveActivate')}</button>
        </div>
      </div>

      {pickerOpen && <ExercisePickerSheet onPick={addExercise} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}
