import { supabase } from '../lib/supabase'
import type { ProfileRow } from './rows'

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from('profile').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data as ProfileRow | null
}

export type ProfileUpdate = Partial<
  Pick<ProfileRow, 'display_name' | 'sex' | 'date_of_birth' | 'height_cm' | 'units_pref' | 'baseline_activity_level'>
>

export async function updateProfile(userId: string, fields: ProfileUpdate): Promise<void> {
  const { error } = await supabase.from('profile').update(fields).eq('id', userId)
  if (error) throw error
}
