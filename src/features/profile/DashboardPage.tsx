import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from './useProfileData'
import { useUnits } from './useUnits'
import { buildEnergySummary } from './energySummary'
import { getActiveSession } from '../../data/sessionRepo'
import { InstallBanner } from '../../pwa/InstallBanner'
import { LogWeightModal } from './LogWeightModal'

export function DashboardPage() {
  const t = useT()
  const { session } = useAuth()
  // `reload` is not optional here: the target-calorie line below is derived from
  // `latestWeight`, so a weigh-in that does not refresh the profile data leaves the number
  // on screen describing the weight the user just replaced.
  const { profile, latestWeight, latestGoal, reload } = useProfileData()
  const u = useUnits()
  const [hasActiveSession, setHasActiveSession] = useState(false)
  const [logOpen, setLogOpen] = useState(false)

  useEffect(() => {
    if (!session) return
    getActiveSession(session.user.id).then((s) => setHasActiveSession(!!s)).catch(() => {})
  }, [session])

  // `session` joins the guard rather than being asserted non-null at the one place that needs
  // the user id. RequireAuth already unmounts this page when the session goes, so the extra
  // test never fires in practice — but it is the difference between TS knowing that and being
  // told to assume it, and the stale-profile window during sign-out is real: the provider
  // leaves `profile`/`latestWeight` set when `userId` goes null.
  if (!session || !profile || !latestWeight || !latestGoal || !profile.sex || !profile.date_of_birth || profile.height_cm == null) return null

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
      <div className="mx-auto max-w-4xl space-y-6">
        <InstallBanner />
        <div>
          <h1 className="text-2xl font-bold">{t('home.welcome')}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('home.targetCalories')}: {summary.target} {t('dashboard.kcal')}</p>
        </div>
        <div className="space-y-3">
          <Link to="/workout" className={`${card} bg-brand-700 text-center text-white hover:bg-brand-800`}>
            {hasActiveSession ? t('workout.resume') : t('workout.start')}
          </Link>
          {/* Above the grid, not in it: the grid is section navigation, and this opens a modal
              in place. Full width beside the workout CTA is also what makes it one tap from
              launch, which is the whole point of putting it here rather than only on Goals. */}
          <button type="button" onClick={() => setLogOpen(true)} className={`${card} bg-slate-100 text-center dark:bg-[#1b2030]`}>
            {t('metrics.logTodaysWeight')}
          </button>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link to="/mesos" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('mesos.title')}</Link>
            <Link to="/exercises" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('exercises.title')}</Link>
            <Link to="/history" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('history.title')}</Link>
            <Link to="/progress" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('progress.title')}</Link>
            <Link to="/nutrition" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('nutrition.title')}</Link>
            <Link to="/notes" className={`${card} bg-slate-100 dark:bg-[#1b2030]`}>{t('notes.title')}</Link>
          </div>
        </div>
      </div>

      {/* `reload()` before closing, so the target-calorie line is already right when the modal
          goes. Re-logging today overwrites today's row (addWeight upserts), so there is nothing
          to guard against a second visit in the same session.
          What actually closes the modal today is not `setLogOpen(false)`, though: `reload()`
          flips the provider's `loading` to true (ProfileDataProvider), `RequireOnboarding`
          returns null while loading, and so this whole page — modal included — unmounts for the
          duration of the refetch and remounts after. `setLogOpen(false)` then runs on an
          unmounted component and does nothing. The user sees a blank screen for three network
          round-trips, which is a poor end to a one-tap action. Pre-existing to `reload` and
          already true of the Goals page's copy of this flow, but this button is where it shows.
          Fixing it means making `reload` revalidate without blanking (only flip `loading` when
          there is no data yet); deliberately not done here — that provider backs every
          authenticated screen and has no tests. */}
      {logOpen && (
        <LogWeightModal
          userId={session.user.id}
          initialWeight={u.toWeight(latestWeight.weight_kg)}
          onClose={() => setLogOpen(false)}
          onSaved={async () => { await reload(); setLogOpen(false) }}
        />
      )}
    </div>
  )
}
