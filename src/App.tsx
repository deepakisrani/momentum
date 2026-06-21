import { Routes, Route } from 'react-router-dom'
import { LoginPage } from './auth/LoginPage'
import { AuthCallback } from './auth/AuthCallback'
import { RequireAuth } from './auth/RequireAuth'
import { ProfileDataProvider } from './features/profile/ProfileDataProvider'
import { RequireOnboarding } from './features/profile/RequireOnboarding'
import { OnboardingPage } from './features/profile/OnboardingPage'
import { DashboardPage } from './features/profile/DashboardPage'
import { ExerciseLibraryPage } from './features/exercises/ExerciseLibraryPage'
import { MesoListPage } from './features/mesos/MesoListPage'
import { MesoBuilderPage } from './features/mesos/MesoBuilderPage'
import { ActiveWorkoutPage } from './features/session/ActiveWorkoutPage'
import { SettingsPage } from './features/settings/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <ProfileDataProvider>
              <Routes>
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/" element={<RequireOnboarding><DashboardPage /></RequireOnboarding>} />
                <Route path="/exercises" element={<RequireOnboarding><ExerciseLibraryPage /></RequireOnboarding>} />
                <Route path="/mesos" element={<RequireOnboarding><MesoListPage /></RequireOnboarding>} />
                <Route path="/mesos/new" element={<RequireOnboarding><MesoBuilderPage /></RequireOnboarding>} />
                <Route path="/mesos/:id/edit" element={<RequireOnboarding><MesoBuilderPage /></RequireOnboarding>} />
                <Route path="/workout" element={<RequireOnboarding><ActiveWorkoutPage /></RequireOnboarding>} />
                <Route path="/settings" element={<RequireOnboarding><SettingsPage /></RequireOnboarding>} />
              </Routes>
            </ProfileDataProvider>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
