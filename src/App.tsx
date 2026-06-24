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
import { GoalsPage } from './features/profile/GoalsPage'
import { EditStatsPage } from './features/profile/EditStatsPage'
import { HistoryPage } from './features/history/HistoryPage'
import { SessionHistoryDetailPage } from './features/history/SessionHistoryDetailPage'
import { ProgressPage } from './features/progress/ProgressPage'
import { ExerciseProgressPage } from './features/progress/ExerciseProgressPage'
import { AppLayout } from './components/AppLayout'

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
                <Route element={<RequireOnboarding><AppLayout /></RequireOnboarding>}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/exercises" element={<ExerciseLibraryPage />} />
                  <Route path="/mesos" element={<MesoListPage />} />
                  <Route path="/mesos/new" element={<MesoBuilderPage />} />
                  <Route path="/mesos/:id/edit" element={<MesoBuilderPage />} />
                  <Route path="/workout" element={<ActiveWorkoutPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/goals" element={<GoalsPage />} />
                  <Route path="/goals/edit" element={<EditStatsPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/history/:sessionId" element={<SessionHistoryDetailPage />} />
                  <Route path="/progress" element={<ProgressPage />} />
                  <Route path="/progress/:exerciseId" element={<ExerciseProgressPage />} />
                </Route>
              </Routes>
            </ProfileDataProvider>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
