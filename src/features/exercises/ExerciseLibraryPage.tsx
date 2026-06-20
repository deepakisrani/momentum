import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { listExercises } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import type { Mechanic } from '../../domain/types'
import { filterExercises, distinctMuscleGroups, distinctEquipment } from './filterExercises'
import { AddExerciseForm } from './AddExerciseForm'

export function ExerciseLibraryPage() {
  const t = useT()
  const { session } = useAuth()
  const userId = session?.user.id ?? ''

  const [all, setAll] = useState<ExerciseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<string | 'all'>('all')
  const [mechanic, setMechanic] = useState<Mechanic | 'all'>('all')

  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    listExercises()
      .then(setAll)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

  const muscleOptions = useMemo(() => distinctMuscleGroups(all), [all])
  const equipmentOptions = useMemo(() => distinctEquipment(all), [all])
  const filtered = useMemo(
    () => filterExercises(all, { query, muscleGroup, mechanic }),
    [all, query, muscleGroup, mechanic],
  )

  function onAdded(row: ExerciseRow) {
    setAll((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)))
    setShowAdd(false)
  }

  const control = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white'

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-slate-500 dark:text-slate-400">{t('nav.back')}</Link>
          <h1 className="text-xl font-bold">{t('exercises.title')}</h1>
          <button onClick={() => setShowAdd((s) => !s)} disabled={loading} className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
            {t('exercises.addCustom')}
          </button>
        </div>

        {showAdd && (
          <AddExerciseForm
            userId={userId}
            muscleOptions={muscleOptions}
            equipmentOptions={equipmentOptions}
            onAdded={onAdded}
            onCancel={() => setShowAdd(false)}
          />
        )}

        <input
          className={`${control} w-full`}
          placeholder={t('exercises.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-2">
          <select className={`${control} flex-1`} value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
            <option value="all">{t('exercises.allMuscles')}</option>
            {muscleOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className={`${control} flex-1`} value={mechanic} onChange={(e) => setMechanic(e.target.value as Mechanic | 'all')}>
            <option value="all">{t('exercises.allMechanics')}</option>
            <option value="compound">{t('exercises.mechanic.compound')}</option>
            <option value="isolation">{t('exercises.mechanic.isolation')}</option>
          </select>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
        ) : (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('exercises.countShown').replace('{shown}', String(filtered.length)).replace('{total}', String(all.length))}
            </p>
            {filtered.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">{t('exercises.empty')}</p>}
            <ul className="space-y-2">
              {filtered.map((e) => (
                <li key={e.id} className="rounded-lg bg-slate-100 p-3 dark:bg-[#1b2030]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{e.name}</span>
                    {e.owner_user_id === userId && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{t('exercises.custom')}</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {e.muscle_group}{e.equipment ? ` · ${e.equipment}` : ''}{e.mechanic ? ` · ${t(`exercises.mechanic.${e.mechanic}`)}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

