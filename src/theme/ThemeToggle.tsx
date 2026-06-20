import { useTheme } from './ThemeProvider'
import { useT } from '../i18n/I18nProvider'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const t = useT()
  const isDark = theme === 'dark'
  return (
    <button
      onClick={toggle}
      aria-label={t('theme.toggle')}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
    >
      {isDark ? `☀️ ${t('theme.light')}` : `🌙 ${t('theme.dark')}`}
    </button>
  )
}
