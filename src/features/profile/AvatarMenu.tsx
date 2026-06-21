import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useT } from '../../i18n/I18nProvider'
import { useProfileData } from './useProfileData'

export function AvatarMenu() {
  const t = useT()
  const { session, signOut } = useAuth()
  const { profile } = useProfileData()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const meta = session?.user.user_metadata as { avatar_url?: string; picture?: string } | undefined
  const avatarUrl = meta?.avatar_url ?? meta?.picture
  const name = profile?.display_name ?? ''
  const initials = name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label={t('nav.menu')} className="h-10 w-10 overflow-hidden rounded-full bg-brand-600 text-sm font-bold text-white">
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center">{initials}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-[#1b2030]">
          <Link to="/goals" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-[#0f1115]">{t('nav.goals')}</Link>
          <Link to="/settings" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-[#0f1115]">{t('settings.title')}</Link>
          <button onClick={() => signOut()} className="block w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-slate-100 dark:hover:bg-[#0f1115]">{t('auth.signOut')}</button>
        </div>
      )}
    </div>
  )
}
