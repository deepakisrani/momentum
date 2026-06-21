import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nProvider } from './i18n/I18nProvider'
import { ThemeProvider } from './theme/ThemeProvider'
import { AuthProvider } from './auth/AuthProvider'
import App from './App'
import '@fontsource/inter-tight/400.css'
import '@fontsource/inter-tight/500.css'
import '@fontsource/inter-tight/600.css'
import '@fontsource/inter-tight/700.css'
import './index.css'

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
