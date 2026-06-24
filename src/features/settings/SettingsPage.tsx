import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from '../profile/useProfileData'
import { updateProfile } from '../../data/profileRepo'
import { resetAccount } from '../../data/accountRepo'
import { useTheme } from '../../theme/ThemeProvider'
import type { Units } from '../../domain/types'
import { InviteModal } from './InviteModal'
import { useInstall } from '../../pwa/useInstall'

const OWNER_EMAIL = 'd3epak91@gmail.com'

export function SettingsPage() {
  const t = useT()
  const { session } = useAuth()
  const { profile, reload } = useProfileData()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  const units: Units = profile?.units_pref ?? 'metric'
  const isOwner = session?.user.email === OWNER_EMAIL
  const [inviteOpen, setInviteOpen] = useState(false)
  const install = useInstall()

  async function onReset() {
    if (!session) return
    if (!window.confirm(t('settings.resetConfirm'))) return
    setResetting(true)
    setError(null)
    try {
      await resetAccount(session.user.id)
      await reload()
      navigate('/onboarding', { replace: true })
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Settings] reset failed:', err)
      setError(t('common.error'))
    } finally {
      setResetting(false)
    }
  }

  async function setUnits(u: Units) {
    if (!session || u === units) return
    setBusy(true)
    try {
      await updateProfile(session.user.id, { units_pref: u })
      await reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-lg space-y-6">
        <section className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
          <h2 className="mb-2 text-sm font-semibold">{t('settings.units')}</h2>
          <div className="flex gap-2">
            {(['metric', 'imperial'] as Units[]).map((u) => (
              <button
                key={u}
                disabled={busy}
                onClick={() => setUnits(u)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                  u === units
                    ? 'bg-brand-600 text-white'
                    : 'bg-white dark:bg-[#0f1115]'
                }`}
              >
                {t(`settings.units.${u}`)}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
          <h2 className="mb-3 text-sm font-semibold">{t('settings.theme')}</h2>
          <div className="flex items-center gap-3">
            <span className={`text-sm ${!isDark ? 'font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>{t('settings.theme.light')}</span>
            <button
              onClick={toggle}
              role="switch"
              aria-checked={isDark}
              aria-label={t('settings.theme')}
              className={`relative inline-block h-6 w-11 rounded-full transition-colors ${isDark ? 'bg-brand-600' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${isDark ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
            <span className={`text-sm ${isDark ? 'font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>{t('settings.theme.dark')}</span>
          </div>
        </section>

        <section className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
          <h2 className="mb-2 text-sm font-semibold">{t('install.settings')}</h2>
          {install.isStandalone ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('install.installed')}</p>
          ) : install.canPrompt ? (
            <button onClick={() => void install.promptInstall()} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">{t('install.install')}</button>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">{install.isIOS ? t('install.ios.body') : t('install.unavailable')}</p>
          )}
        </section>

        {isOwner && (
          <section className="rounded-xl bg-slate-100 p-4 dark:bg-[#1b2030]">
            <h2 className="mb-2 text-sm font-semibold">{t('settings.invites')}</h2>
            <button onClick={() => setInviteOpen(true)} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">{t('settings.manageInvites')}</button>
          </section>
        )}

        <section className="rounded-xl border border-red-300 bg-slate-100 p-4 dark:border-red-900/60 dark:bg-[#1b2030]">
          <h2 className="mb-1 text-sm font-semibold text-red-600 dark:text-red-400">{t('settings.resetAccount')}</h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('settings.resetNote')}</p>
          <button
            disabled={resetting}
            onClick={onReset}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {resetting ? t('common.loading') : t('settings.resetAccount')}
          </button>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </section>
      </div>
      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} ownerEmail={session?.user.email ?? ''} />}
    </div>
  )
}
