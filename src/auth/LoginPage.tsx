import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n/I18nProvider'
import { Wordmark } from '../components/Wordmark'

export function LoginPage() {
  const t = useT()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const isLocalSupabase = import.meta.env.VITE_LOCAL_SUPABASE === 'true'

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}auth/callback` },
    })
    if (error) {
      if (import.meta.env.DEV) console.error('[Auth] signInWithOAuth error:', error.message)
      setError(error.message)
    }
  }

  async function signInWithPassword(createAccount: boolean) {
    setBusy(true)
    setError(null)
    try {
      const result = createAccount
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password })
      if (result.error) {
        setError(result.error.message)
      } else if (result.data.session) {
        navigate('/', { replace: true })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <Wordmark className="w-64 max-w-[80%]" />
      {isLocalSupabase ? (
        <div className="flex w-72 flex-col gap-3">
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">{t('auth.localHint')}</p>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder={t('auth.email')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white" />
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder={t('auth.password')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-[#1b2030] dark:text-white" />
          <button disabled={busy || !email || !password} onClick={() => void signInWithPassword(false)} className="rounded-lg bg-brand-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{t('auth.localSignIn')}</button>
          <button disabled={busy || !email || !password} onClick={() => void signInWithPassword(true)} className="rounded-lg border border-brand-700 px-5 py-3 font-semibold text-brand-700 disabled:opacity-60 dark:text-brand-400">{t('auth.localCreate')}</button>
        </div>
      ) : (
        <button onClick={signInWithGoogle} className="rounded-lg bg-brand-700 hover:bg-brand-800 px-5 py-3 font-semibold">
          {t('auth.signInWithGoogle')}
        </button>
      )}
      {error && <p className="text-red-400 text-sm max-w-xs text-center">{isLocalSupabase ? error : t('auth.notInvited')}</p>}
    </div>
  )
}
