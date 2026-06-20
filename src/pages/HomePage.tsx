import { supabase } from '../lib/supabase'
import { useT } from '../i18n/I18nProvider'
import { ThemeToggle } from '../theme/ThemeToggle'

export function HomePage() {
  const t = useT()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <p className="text-xl">{t('home.welcome')}</p>
      <ThemeToggle />
      <button
        onClick={() => supabase.auth.signOut()}
        className="text-sm text-slate-500 underline dark:text-slate-400"
      >
        {t('auth.signOut')}
      </button>
    </div>
  )
}
