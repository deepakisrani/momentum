import { supabase } from '../lib/supabase'
import type { MesoRow, MesoDayRow, MesoDayExerciseRow } from './rows'
import type { MesoDraft, DraftDay, DraftExercise, MesoFull } from '../features/mesos/mesoDraft'

export async function listMesos(userId: string): Promise<MesoRow[]> {
  const { data, error } = await supabase
    .from('meso')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as MesoRow[]
}

export async function getMesoFull(mesoId: string): Promise<MesoFull> {
  const { data: meso, error: me } = await supabase.from('meso').select('*').eq('id', mesoId).single()
  if (me) throw me
  const { data: days, error: de } = await supabase
    .from('meso_day').select('*').eq('meso_id', mesoId).order('order_index', { ascending: true })
  if (de) throw de
  const dayIds = (days ?? []).map((d) => d.id)
  let exercises: MesoDayExerciseRow[] = []
  if (dayIds.length) {
    const { data: ex, error: ee } = await supabase
      .from('meso_day_exercise').select('*').in('meso_day_id', dayIds).order('order_index', { ascending: true })
    if (ee) throw ee
    exercises = (ex ?? []) as MesoDayExerciseRow[]
  }
  return {
    meso: meso as MesoRow,
    days: (days as MesoDayRow[]).map((d) => ({ ...d, exercises: exercises.filter((e) => e.meso_day_id === d.id) })),
  }
}

export async function saveMeso(userId: string, draft: MesoDraft): Promise<string> {
  return draft.id ? updateMeso(draft) : createMeso(userId, draft)
}

async function createMeso(userId: string, draft: MesoDraft): Promise<string> {
  const { data, error } = await supabase
    .from('meso')
    .insert({
      user_id: userId,
      name: draft.name,
      scheduling_style: draft.schedulingStyle,
      deload_every_n_microcycles: draft.deloadEveryN,
      is_active: false,
    })
    .select('id')
    .single()
  if (error) throw error
  const mesoId = data.id as string
  for (let i = 0; i < draft.days.length; i++) {
    await insertDay(mesoId, draft.days[i], i)
  }
  return mesoId
}

async function insertDay(mesoId: string, day: DraftDay, order: number): Promise<void> {
  const { data, error } = await supabase
    .from('meso_day').insert({ meso_id: mesoId, label: day.label, order_index: order }).select('id').single()
  if (error) throw error
  await insertExercises(data.id as string, day.exercises)
}

async function insertExercises(dayId: string, exercises: DraftExercise[]): Promise<void> {
  if (!exercises.length) return
  const rows = exercises.map((e, i) => ({
    meso_day_id: dayId, exercise_id: e.exerciseId, order_index: i,
    target_sets: e.targetSets, rep_min: e.repMin, rep_max: e.repMax,
  }))
  const { error } = await supabase.from('meso_day_exercise').insert(rows)
  if (error) throw error
}

async function updateMeso(draft: MesoDraft): Promise<string> {
  const mesoId = draft.id as string
  const { error: ue } = await supabase
    .from('meso')
    .update({ name: draft.name, scheduling_style: draft.schedulingStyle, deload_every_n_microcycles: draft.deloadEveryN })
    .eq('id', mesoId)
  if (ue) throw ue

  // Reconcile days by id (preserves history: workout_session.meso_day_id).
  const { data: existingDays, error: ee } = await supabase.from('meso_day').select('id').eq('meso_id', mesoId)
  if (ee) throw ee
  const keptDayIds = draft.days.filter((d) => d.id).map((d) => d.id as string)
  const removedDayIds = (existingDays ?? []).map((d) => d.id).filter((id) => !keptDayIds.includes(id))
  if (removedDayIds.length) {
    const { error } = await supabase.from('meso_day').delete().in('id', removedDayIds)
    if (error) throw error
  }

  for (let i = 0; i < draft.days.length; i++) {
    const day = draft.days[i]
    let dayId = day.id
    if (dayId) {
      const { error } = await supabase.from('meso_day').update({ label: day.label, order_index: i }).eq('id', dayId)
      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from('meso_day').insert({ meso_id: mesoId, label: day.label, order_index: i }).select('id').single()
      if (error) throw error
      dayId = data.id as string
    }
    await reconcileExercises(dayId, day.exercises)
  }
  return mesoId
}

async function reconcileExercises(dayId: string, exercises: DraftExercise[]): Promise<void> {
  const { data: existing, error: ee } = await supabase.from('meso_day_exercise').select('id').eq('meso_day_id', dayId)
  if (ee) throw ee
  const keptIds = exercises.filter((e) => e.id).map((e) => e.id as string)
  const removed = (existing ?? []).map((e) => e.id).filter((id) => !keptIds.includes(id))
  if (removed.length) {
    const { error } = await supabase.from('meso_day_exercise').delete().in('id', removed)
    if (error) throw error
  }
  for (let i = 0; i < exercises.length; i++) {
    const e = exercises[i]
    const payload = {
      meso_day_id: dayId, exercise_id: e.exerciseId, order_index: i,
      target_sets: e.targetSets, rep_min: e.repMin, rep_max: e.repMax,
    }
    if (e.id) {
      const { error } = await supabase.from('meso_day_exercise').update(payload).eq('id', e.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('meso_day_exercise').insert(payload)
      if (error) throw error
    }
  }
}

/** Exactly one active meso per user. Unset all first (the partial unique index forbids two actives). */
export async function setActiveMeso(userId: string, mesoId: string): Promise<void> {
  const { error: e1 } = await supabase.from('meso').update({ is_active: false }).eq('user_id', userId)
  if (e1) throw e1
  const { error: e2 } = await supabase.from('meso').update({ is_active: true }).eq('id', mesoId)
  if (e2) throw e2
}

export async function deleteMeso(mesoId: string): Promise<void> {
  const { error } = await supabase.from('meso').delete().eq('id', mesoId)
  if (error) throw error
}

export async function getActiveMeso(userId: string): Promise<MesoRow | null> {
  const { data, error } = await supabase
    .from('meso').select('*').eq('user_id', userId).eq('is_active', true).maybeSingle()
  if (error) throw error
  return data as MesoRow | null
}

/** Map of exercise_id -> { targetSets, repMin, repMax } for a meso day (for targets + suggestions). */
export async function getMesoDayTargets(mesoDayId: string): Promise<Record<string, { targetSets: number; repMin: number; repMax: number }>> {
  const { data, error } = await supabase
    .from('meso_day_exercise').select('exercise_id, target_sets, rep_min, rep_max').eq('meso_day_id', mesoDayId)
  if (error) throw error
  const map: Record<string, { targetSets: number; repMin: number; repMax: number }> = {}
  for (const r of data ?? []) map[r.exercise_id] = { targetSets: r.target_sets, repMin: r.rep_min, repMax: r.rep_max }
  return map
}
