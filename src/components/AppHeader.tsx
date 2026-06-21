import { Link } from 'react-router-dom'
import { Wordmark } from './Wordmark'
import { AvatarMenu } from '../features/profile/AvatarMenu'

/** Persistent top app bar: logo (→ home) on the left, avatar menu on the right. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-[#0f1115]/90">
      <div className="mx-auto flex max-w-md items-center justify-between px-6 py-2.5">
        <Link to="/" aria-label="Home" className="flex items-center">
          <Wordmark className="h-6" />
        </Link>
        <AvatarMenu />
      </div>
    </header>
  )
}
