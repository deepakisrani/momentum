import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from './useProfileData'
import { buildEnergySummary } from './energySummary'
import { getActiveSession } from '../../data/sessionRepo'
import { InstallBanner } from '../../pwa/InstallBanner'

export function DashboardPage() {
  const t = useT()
  const { session } = useAuth()
  const { profile, latestWeight, latestGoal } = useProfileData()
  const [hasActiveSession, setHasActiveSession] = useState(false)

  useEffect(() => {
    if (!session) return
    getActiveSession(session.user.id).then((s) => setHasActiveSession(!!s)).catch(() => {})
  }, [session])

  if (!profile || !latestWeight || !latestGoal || !profile.sex || !profile.date_of_birth || profile.height_cm == null) return null

  const summary = buildEnergySummary({
    sex: profile.sex,
    dob: new Date(profile.date_of_birth + 'T12:00:00'),
    heightCm: profile.height_cm,
    weightKg: latestWeight.weight_kg,
    activityFactor: profile.baseline_activity_level,
    goal: latestGoal.goal,
    today: new Date(),
  })
  const firstName = (profile.display_name ?? '').split(' ')[0]
  const card = 'block w-full rounded-2xl px-5 py-6 text-lg font-bold'

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 dark:bg-[#0f1115] dark:text-white">
      <div className="mx-auto max-w-md space-y-6">
        <InstallBanner />
        <div>
          <h1 className="text-2xl font-bold">{t('home.welcome')}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('home.targetCalories')}: {summary.target} {t('dashboard.kcal')}</p>
        </div>
        <div className="space-y-3">
          <Link to="/workout" className={`${card} bg-brand-700 text-center text-white hover:bg-brand-800`}>
            {hasActiveSession ? t('workout.resume') : t('workout.start')}
          </Link>
          <Link to="/mesos" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('mesos.title')}</Link>
          <Link to="/exercises" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('exercises.title')}</Link>
        </div>
      </div>
    </div>
  )
}
