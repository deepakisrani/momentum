import { supabase } from '../lib/supabase'
import { useT } from '../i18n/I18nProvider'

export function HomePage() {
  const t = useT()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#0f1115] text-white">
      <p className="text-xl">{t('home.welcome')}</p>
      <button onClick={() => supabase.auth.signOut()} className="text-sm text-slate-400 underline">
        {t('auth.signOut')}
      </button>
    </div>
  )
}
