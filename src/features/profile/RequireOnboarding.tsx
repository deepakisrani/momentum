import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useProfileData } from './useProfileData'
import { isOnboardingComplete } from './onboardingStatus'

export function RequireOnboarding({ children }: { children: ReactNode }) {
  const { profile, latestWeight, latestGoal, loading } = useProfileData()
  if (loading) return null
  if (!isOnboardingComplete(profile, latestWeight, latestGoal)) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}
