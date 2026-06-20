import { useState, type FormEvent } from 'react'
import { useT } from '../../i18n/I18nProvider'
import { addCustomExercise } from '../../data/exerciseRepo'
import type { ExerciseRow } from '../../data/rows'
import type { Mechanic } from '../../domain/types'

export function AddExerciseForm({
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

  const control = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#0f1115] dark:text-white'

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
