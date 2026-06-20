import { useEffect, useMemo, useState } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { useAuth } from '../../auth/useAuth'
import { listExercises } from '../../data/exerciseRepo'
import { filterExercises, distinctMuscleGroups, distinctEquipment } from '../exercises/filterExercises'
import { AddExerciseForm } from '../exercises/AddExerciseForm'
import type { ExerciseRow } from '../../data/rows'

export function ExercisePickerSheet({ onPick, onClose }: { onPick: (ex: ExerciseRow) => void; onClose: () => void }) {
  const t = useT()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [all, setAll] = useState<ExerciseRow[]>([])
  const [query, setQuery] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<string | 'all'>('all')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { listExercises().then(setAll).catch(() => {}) }, [])

  const muscles = useMemo(() => distinctMuscleGroups(all), [all])
  const equipment = useMemo(() => distinctEquipment(all), [all])
  const filtered = useMemo(() => filterExercises(all, { query, muscleGroup, mechanic: 'all' }), [all, query, muscleGroup])
  const control = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 text-slate-900 dark:bg-[#0f1115] dark:text-white" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{t('meso.addExercise')}</h2>
          <button onClick={onClose} className="text-sm text-slate-500 dark:text-slate-400">{t('exercises.cancel')}</button>
        </div>
        <input className={`${control} mb-2`} placeholder={t('exercises.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className={`${control} mb-3`} value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
          <option value="all">{t('exercises.allMuscles')}</option>
          {muscles.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {!showAdd ? (
          <button
            onClick={() => setShowAdd(true)}
            className="mb-3 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-brand-700 dark:bg-[#1b2030] dark:text-brand-400"
          >
            {t('exercises.addCustom')}
          </button>
        ) : (
          <div className="mb-3">
            <AddExerciseForm
              userId={userId}
              muscleOptions={muscles}
              equipmentOptions={equipment}
              onAdded={onPick}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        )}
        <ul className="space-y-1">
          {filtered.map((e) => (
            <li key={e.id}>
              <button onClick={() => onPick(e)} className="w-full rounded-lg bg-slate-100 px-3 py-2 text-left dark:bg-[#1b2030]">
                <span className="font-medium">{e.name}</span>
                <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{e.muscle_group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
