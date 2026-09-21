import { supabase } from '../lib/supabase'
import { readLocalCache, writeLocalCache } from '../lib/localCache'
import type { ExerciseRow } from './rows'
import type { Mechanic } from '../domain/types'

function cacheKey(userId: string): string {
  return `exercises:v1:${userId}`
}

/** Cached exercise data is per user: the shared library is global, but custom exercises are not. */
export async function getCachedExercises(userId: string): Promise<ExerciseRow[] | null> {
  return readLocalCache<ExerciseRow[]>(cacheKey(userId))
}

/** Always reads Supabase, then refreshes the on-device cache when a user id is supplied. */
export async function listExercises(userId?: string): Promise<ExerciseRow[]> {
  const { data, error } = await supabase.from('exercise').select('*').order('name', { ascending: true })
  if (error) throw error
  const exercises = (data ?? []) as ExerciseRow[]
  if (userId) void writeLocalCache(cacheKey(userId), exercises)
  return exercises
}

export interface NewExercise {
  name: string
  muscle_group: string
  equipment: string | null
  mechanic: Mechanic | null
}

/** Inserts a private custom exercise owned by the user (RLS requires owner_user_id = auth.uid()). */
export async function addCustomExercise(userId: string, ex: NewExercise): Promise<ExerciseRow> {
  const { data, error } = await supabase
    .from('exercise')
    .insert({ ...ex, owner_user_id: userId, is_public: false })
    .select('*')
    .single()
  if (error) throw error
  return data as ExerciseRow
}

/** Exercises keyed by id (planned, custom, swapped, or added), for name display. */
export async function getExercisesByIds(ids: string[]): Promise<Record<string, ExerciseRow>> {
  if (!ids.length) return {}
  const { data, error } = await supabase.from('exercise').select('*').in('id', ids)
  if (error) throw error
  return Object.fromEntries(((data ?? []) as ExerciseRow[]).map((e) => [e.id, e]))
}
