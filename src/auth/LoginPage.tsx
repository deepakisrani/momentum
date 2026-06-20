import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n/I18nProvider'

export function LoginPage() {
  const t = useT()
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      if (import.meta.env.DEV) console.error('[Auth] signInWithOAuth error:', error.message)
      setError(error.message)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#0f1115] text-white">
      <h1 className="text-3xl font-bold">{t('app.name')}</h1>
      <button onClick={signIn} className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold">
        {t('auth.signInWithGoogle')}
      </button>
      {error && <p className="text-red-400 text-sm max-w-xs text-center">{t('auth.notInvited')}</p>}
    </div>
  )
}
