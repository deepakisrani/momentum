import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export function AuthCallback() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (loading) return
    if (!session) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1))
      const queryParams = new URLSearchParams(window.location.search)
      const authInFlight = hashParams.has('access_token') || queryParams.has('code')
      if (authInFlight) return // supabase is still exchanging the token; wait for onAuthStateChange
    }
    navigate(session ? '/' : '/login', { replace: true })
  }, [session, loading, navigate])
  return null
}
