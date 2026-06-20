import { useContext } from 'react'
import { ProfileDataContext } from './ProfileDataProvider'

export function useProfileData() {
  return useContext(ProfileDataContext)
}
