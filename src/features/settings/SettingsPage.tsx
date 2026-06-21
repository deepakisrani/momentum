import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from '../profile/useProfileData'
import { updateProfile } from '../../data/profileRepo'
import { ThemeToggle } from '../../theme/ThemeToggle'
import type { Units } from '../../domain/types'

export function SettingsPage() {
  const t = useT()
  const { session } = useAuth()
  const { profile, reload } = useProfileData()
  const [busy, setBusy] = useState(false)
  const units: Units = profile?.units_pref ?? 'metric'

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
      <div className="mx-auto max-w-md space-y-6">
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
          <h2 className="mb-2 text-sm font-semibold">{t('settings.theme')}</h2>
          <ThemeToggle />
        </section>
      </div>
    </div>
  )
}
