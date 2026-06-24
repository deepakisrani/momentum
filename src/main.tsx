import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nProvider } from './i18n/I18nProvider'
import { ThemeProvider } from './theme/ThemeProvider'
import { AuthProvider } from './auth/AuthProvider'
import App from './App'
import './pwa/installPrompt'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/inter-tight/400.css'
import '@fontsource/inter-tight/500.css'
import '@fontsource/inter-tight/600.css'
import '@fontsource/inter-tight/700.css'
import './index.css'

// Register the service worker and check for a new build hourly while the app is
// open (it also checks on launch). In autoUpdate mode the new SW activates and
// the page reloads itself to the latest build.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) setInterval(() => { void registration.update() }, 60 * 60 * 1000)
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>,
)
