import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth/useAuth'
import { getProfile } from '../../data/profileRepo'
import { getLatestWeight } from '../../data/weightRepo'
import { getLatestGoal } from '../../data/goalRepo'
import type { ProfileRow, WeightLogRow, GoalLogRow } from '../../data/rows'

export interface ProfileData {
  profile: ProfileRow | null
  latestWeight: WeightLogRow | null
  latestGoal: GoalLogRow | null
  loading: boolean
  reload: () => Promise<void>
}

export const ProfileDataContext = createContext<ProfileData>({
  profile: null, latestWeight: null, latestGoal: null, loading: true, reload: async () => {},
})

export function ProfileDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [latestWeight, setLatestWeight] = useState<WeightLogRow | null>(null)
  const [latestGoal, setLatestGoal] = useState<GoalLogRow | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [p, w, g] = await Promise.all([getProfile(userId), getLatestWeight(userId), getLatestGoal(userId)])
      setProfile(p)
      setLatestWeight(w)
      setLatestGoal(g)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <ProfileDataContext.Provider value={{ profile, latestWeight, latestGoal, loading, reload }}>
      {children}
    </ProfileDataContext.Provider>
  )
}
