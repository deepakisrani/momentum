import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!url || !publishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
}

export const supabase = createClient(url, publishableKey)
