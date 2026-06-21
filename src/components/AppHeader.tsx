import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Wordmark } from './Wordmark'
import { AvatarMenu } from '../features/profile/AvatarMenu'
import { useT } from '../i18n/I18nProvider'

function titleKey(path: string): string | null {
  if (path === '/') return null
  if (path === '/goals') return 'goals.title'
  if (path === '/settings') return 'settings.title'
  if (path === '/exercises') return 'exercises.title'
  if (path === '/mesos') return 'mesos.title'
  if (path === '/mesos/new') return 'mesos.new'
  if (path.startsWith('/mesos/') && path.endsWith('/edit')) return 'mesos.editTitle'
  if (path === '/workout') return 'nav.workout'
  return null
}

/** Persistent top bar. Home: logo + avatar. Other screens: back + centered title + avatar. */
export function AppHeader() {
  const t = useT()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isHome = pathname === '/'
  const tk = titleKey(pathname)

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 text-slate-900 backdrop-blur dark:border-slate-800 dark:bg-[#0f1115]/90 dark:text-white">
      <div className="mx-auto grid max-w-md grid-cols-[1fr_auto_1fr] items-center px-6 py-2.5">
        <div className="justify-self-start">
          {isHome ? (
            <Link to="/" aria-label="Home" className="flex items-center"><Wordmark className="h-6" /></Link>
          ) : (
            <button onClick={() => navigate(-1)} aria-label={t('nav.back')} className="text-2xl leading-none text-slate-700 dark:text-slate-200">←</button>
          )}
        </div>
        <div className="justify-self-center">
          {!isHome && tk && <h1 className="text-base font-semibold">{t(tk)}</h1>}
        </div>
        <div className="justify-self-end"><AvatarMenu /></div>
      </div>
    </header>
  )
}
