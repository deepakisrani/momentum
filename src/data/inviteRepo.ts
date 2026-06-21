import { supabase } from '../lib/supabase'

export interface InviteRow {
  email: string
  invited_at: string
}

export async function listInvites(): Promise<InviteRow[]> {
  const { data, error } = await supabase.from('allowed_emails').select('email, invited_at').order('invited_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InviteRow[]
}

export async function addInvite(email: string): Promise<void> {
  const { error } = await supabase.from('allowed_emails').upsert({ email: email.trim().toLowerCase() }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) throw error
}

export async function removeInvite(email: string): Promise<void> {
  const { error } = await supabase.from('allowed_emails').delete().eq('email', email.trim().toLowerCase())
  if (error) throw error
}
