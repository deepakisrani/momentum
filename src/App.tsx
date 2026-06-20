import { Routes, Route } from 'react-router-dom'
import { LoginPage } from './auth/LoginPage'
import { AuthCallback } from './auth/AuthCallback'
import { RequireAuth } from './auth/RequireAuth'
import { ProfileDataProvider } from './features/profile/ProfileDataProvider'
import { RequireOnboarding } from './features/profile/RequireOnboarding'
import { OnboardingPage } from './features/profile/OnboardingPage'
import { DashboardPage } from './features/profile/DashboardPage'

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
              </Routes>
            </ProfileDataProvider>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
