import { supabase } from '../lib/supabase'
import type { GoalLogRow } from './rows'
import type { Goal } from '../domain/types'

export async function getLatestGoal(userId: string): Promise<GoalLogRow | null> {
  const { data, error } = await supabase
    .from('goal_log')
    .select('*')
    .eq('user_id', userId)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as GoalLogRow | null
}

/** One goal per effective date: re-setting the same day overwrites (needs the goal_log(user_id,effective_from) unique index). */
export async function addGoal(userId: string, effectiveFrom: string, goal: Goal): Promise<void> {
  const { error } = await supabase
    .from('goal_log')
    .upsert({ user_id: userId, effective_from: effectiveFrom, goal }, { onConflict: 'user_id,effective_from' })
  if (error) throw error
}
