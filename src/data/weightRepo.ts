import { supabase } from '../lib/supabase'
import type { WeightLogRow } from './rows'

export async function getLatestWeight(userId: string): Promise<WeightLogRow | null> {
  const { data, error } = await supabase
    .from('weight_log')
    .select('*')
    .eq('user_id', userId)
    .order('logged_on', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as WeightLogRow | null
}

export async function listWeights(userId: string): Promise<WeightLogRow[]> {
  const { data, error } = await supabase
    .from('weight_log')
    .select('*')
    .eq('user_id', userId)
    .order('logged_on', { ascending: true })
  if (error) throw error
  return (data ?? []) as WeightLogRow[]
}

export async function addWeight(userId: string, loggedOn: string, weightKg: number): Promise<void> {
  const { error } = await supabase.from('weight_log').insert({ user_id: userId, logged_on: loggedOn, weight_kg: weightKg })
  if (error) throw error
}
