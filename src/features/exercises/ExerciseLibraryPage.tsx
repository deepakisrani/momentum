import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { listExercises, addCustomExercise } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import type { Mechanic } from '../../domain/types'
import { filterExercises, distinctMuscleGroups, distinctEquipment } from './filterExercises'

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

  const control = 'rounded-lg bg-white px-3 py-2 text-slate-900 dark:bg-[#1b2030] dark:text-white'

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-slate-500 dark:text-slate-400">{t('nav.back')}</Link>
          <h1 className="text-xl font-bold">{t('exercises.title')}</h1>
          <button onClick={() => setShowAdd((s) => !s)} className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800">
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
          <p className="text-sm text-slate-500 dark:text-slate-400">…</p>
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
                    {e.owner_user_id && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{t('exercises.custom')}</span>}
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

function AddExerciseForm({
  userId, muscleOptions, equipmentOptions, onAdded, onCancel,
}: {
  userId: string
  muscleOptions: string[]
  equipmentOptions: string[]
  onAdded: (row: ExerciseRow) => void
  onCancel: () => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  const [muscleGroup, setMuscleGroup] = useState(muscleOptions[0] ?? 'chest')
  const [equipment, setEquipment] = useState(equipmentOptions[0] ?? '')
  const [mechanic, setMechanic] = useState<Mechanic>('compound')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const control = 'w-full rounded-lg bg-white px-3 py-2 text-slate-900 dark:bg-[#0f1115] dark:text-white'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const row = await addCustomExercise(userId, {
        name: name.trim(),
        muscle_group: muscleGroup,
        equipment: equipment || null,
        mechanic,
      })
      onAdded(row)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Exercises] addCustom failed:', err)
      setError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
      <label className="block text-sm">{t('exercises.name')}
        <input className={control} required value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm">{t('exercises.muscleGroup')}
        <select className={control} value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
          {muscleOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <label className="block text-sm">{t('exercises.equipment')}
        <select className={control} value={equipment} onChange={(e) => setEquipment(e.target.value)}>
          <option value="">—</option>
          {equipmentOptions.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
        </select>
      </label>
      <label className="block text-sm">{t('exercises.mechanicLabel')}
        <select className={control} value={mechanic} onChange={(e) => setMechanic(e.target.value as Mechanic)}>
          <option value="compound">{t('exercises.mechanic.compound')}</option>
          <option value="isolation">{t('exercises.mechanic.isolation')}</option>
        </select>
      </label>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
          {saving ? t('common.saving') : t('exercises.save')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg bg-white px-4 py-2 text-slate-900 dark:bg-[#0f1115] dark:text-white">
          {t('exercises.cancel')}
        </button>
      </div>
    </form>
  )
}
