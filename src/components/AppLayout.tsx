import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'

/** Layout for authenticated, onboarded screens: persistent header + the routed page. */
export function AppLayout() {
  return (
    <>
      <AppHeader />
      <Outlet />
    </>
  )
}
