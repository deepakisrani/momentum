import { supabase } from '../lib/supabase'
import type { ExerciseRow } from './rows'
import type { Mechanic } from '../domain/types'

export async function listExercises(): Promise<ExerciseRow[]> {
  const { data, error } = await supabase.from('exercise').select('*').order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as ExerciseRow[]
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
    .insert({ owner_user_id: userId, is_public: false, ...ex })
    .select('*')
    .single()
  if (error) throw error
  return data as ExerciseRow
}
