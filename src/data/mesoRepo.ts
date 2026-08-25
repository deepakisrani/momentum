import { supabase } from '../lib/supabase'
import type { MesoRow, MesoDayRow, MesoDayExerciseRow } from './rows'
import type { MesoDraft, DraftDay, DraftExercise, MesoFull } from '../features/mesos/mesoDraft'

/** Live mesos for the Mesos page, newest first. Soft-deleted ones are excluded: deleting a
 * meso should remove it from the app, and History is where its log stays readable. */
export async function listMesos(userId: string): Promise<MesoRow[]> {
  const { data, error } = await supabase
    .from('meso')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as MesoRow[]
}

/** Every meso including soft-deleted ones, newest first. History needs the deleted ones --
 * keeping their sessions readable is the whole point of soft-deleting -- which is why this is
 * a separate function rather than a flag on `listMesos`: no caller can surface a deleted meso
 * where it does not belong by forgetting an argument. */
export async function listMesosForHistory(userId: string): Promise<MesoRow[]> {
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
    .update({ name: draft.name, deload_every_n_microcycles: draft.deloadEveryN })
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

/** Activate a meso. `freshRun` stamps `activated_at`, which is what makes the day-scoped
 * surfaces (deload cadence, "Previous workout") ignore everything logged before now --
 * re-activating an old meso then behaves like a new block. Without it the meso is resumed:
 * activated, window untouched, cadence intact.
 *
 * Two writes, no transaction: `one_active_meso_per_user` (0001) is a partial unique index
 * `where is_active`, so the old active row must be cleared before the new one is set. If the
 * second write fails the user is left with no active meso -- fail-safe rather than two actives,
 * visibly so on the Mesos page, and fixed by clicking Activate again (both writes are
 * idempotent). Making it atomic from the client would need an RPC, which is out of scope. */
export async function setActiveMeso(userId: string, mesoId: string, opts?: { freshRun?: boolean }): Promise<void> {
  // The sweep deliberately does not exclude soft-deleted rows. `deleteMeso` clears `is_active`,
  // so they are normally already false and clearing them is a no-op (`meso` has no `updated_at`
  // to disturb). But if a stray deleted-and-active row ever exists -- a `deleteMeso` that failed
  // after the delete stamp, or a hand-edited row -- it occupies the unique index slot and would
  // make the activation below fail with a uniqueness violation. Sweeping it heals that instead.
  const { error: e1 } = await supabase.from('meso').update({ is_active: false }).eq('user_id', userId)
  if (e1) throw e1
  // `activated_at` is a client clock. It is compared against `workout_session.started_at`, which
  // is a server `default now()`, so a device clock running fast puts the window slightly in the
  // future and briefly hides a just-finished session from the panel and the deload count. Server
  // time is unreachable from PostgREST without an RPC or a trigger (a column default does not
  // fire on UPDATE), and the error is bounded by device skew, so client time it is.
  const patch: { is_active: boolean; activated_at?: string } = { is_active: true }
  if (opts?.freshRun) patch.activated_at = new Date().toISOString()
  // Refuse to activate a soft-deleted meso. The builder still loads one from a stale
  // /mesos/:id/edit URL (`getMesoFull` is deliberately unfiltered), and its "Save and activate"
  // would otherwise set `is_active` on a row `getActiveMeso` ignores -- a silent no-op leaving
  // the user with no active meso and no explanation. Reading the affected row back makes that
  // loud. `user_id` is redundant with the `meso_self` RLS policy; it is here so the row count
  // below means "no live meso of yours" rather than "RLS ate it".
  const { data, error: e2 } = await supabase
    .from('meso').update(patch).eq('id', mesoId).eq('user_id', userId).is('deleted_at', null).select('id')
  if (e2) throw e2
  if (!data?.length) throw new Error(`setActiveMeso: no live meso ${mesoId} to activate`)
}

/** Soft delete: the row stays so its sessions, days and day labels survive, and History can
 * still group by it. `is_active` is cleared for two reasons -- a deleted meso must not keep
 * driving the workout screen, and the `one_active_meso_per_user` partial unique index
 * (0001) is defined `where is_active`, so leaving it set would keep a dead meso occupying
 * that slot. There is deliberately no undelete in the UI. */
export async function deleteMeso(mesoId: string): Promise<void> {
  const { error } = await supabase
    .from('meso')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', mesoId)
  if (error) throw error
}

export async function getActiveMeso(userId: string): Promise<MesoRow | null> {
  // `deleted_at is null` is defensive -- `deleteMeso` clears `is_active`, so a deleted-and-active
  // row should not exist. It makes one degrade to "no active meso" rather than driving the
  // workout screen from a deleted plan.
  const { data, error } = await supabase
    .from('meso').select('*').eq('user_id', userId).eq('is_active', true).is('deleted_at', null).maybeSingle()
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
