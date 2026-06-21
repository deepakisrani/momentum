import { useState } from 'react'
import { useT } from '../i18n/I18nProvider'
import { useInstall } from './useInstall'

const DISMISS_KEY = 'momentum.installDismissed'

/** Dismissible home-screen banner prompting the user to install the PWA. */
export function InstallBanner() {
  const t = useT()
  const { canPrompt, isIOS, isStandalone, promptInstall } = useInstall()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  // Nothing to offer: already installed, no native prompt and not iOS, or dismissed.
  if (isStandalone || dismissed || (!canPrompt && !isIOS)) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  async function install() {
    const accepted = await promptInstall()
    if (accepted) setDismissed(true)
  }

  return (
    <div className="rounded-2xl border border-brand-600/40 bg-slate-100 p-4 dark:bg-[#1b2030]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{t('install.banner.title')}</p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {isIOS ? t('install.ios.body') : t('install.banner.body')}
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label={t('install.notNow')}
          className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          ✕
        </button>
      </div>
      {!isIOS && (
        <button
          onClick={install}
          className="mt-3 w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
        >
          {t('install.install')}
        </button>
      )}
    </div>
  )
}
