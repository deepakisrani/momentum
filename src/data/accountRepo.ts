import { supabase } from '../lib/supabase'

/**
 * Wipes the user's own data and resets their profile so onboarding runs again.
 * Keeps the account, the invite allowlist, and global exercises. Works under RLS
 * (a user may delete their own rows; FK cascades remove the children).
 * Deletion order matters: sessions and mesos go before custom exercises so the
 * RESTRICT FK from logged/planned rows to exercise is never violated.
 */
export async function resetAccount(userId: string): Promise<void> {
  const wipe = async (table: string, column: string) => {
    const { error } = await supabase.from(table).delete().eq(column, userId)
    if (error) throw error
  }

  await wipe('workout_session', 'user_id') // cascades session_exercise → logged_set → set_segment
  await wipe('meso', 'user_id') // cascades meso_day → meso_day_exercise, + microcycle
  await wipe('weight_log', 'user_id')
  await wipe('goal_log', 'user_id')
  await wipe('exercise', 'owner_user_id') // custom exercises only

  const { error } = await supabase
    .from('profile')
    .update({ sex: null, date_of_birth: null, height_cm: null, units_pref: 'metric', baseline_activity_level: 1.2 })
    .eq('id', userId)
  if (error) throw error
}
