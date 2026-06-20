import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useProfileData } from './useProfileData'
import { isOnboardingComplete } from './onboardingStatus'
import { useT } from '../../i18n/I18nProvider'

export function RequireOnboarding({ children }: { children: ReactNode }) {
  const t = useT()
  const { profile, latestWeight, latestGoal, loading, error, reload } = useProfileData()
  if (loading) return null
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
        <p>{t('error.loadFailed')}</p>
        <button onClick={() => void reload()} className="rounded-lg bg-brand-700 px-5 py-2 font-semibold text-white hover:bg-brand-800">
          {t('common.retry')}
        </button>
      </div>
    )
  }
  if (!isOnboardingComplete(profile, latestWeight, latestGoal)) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}
