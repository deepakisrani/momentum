import type { ProfileRow, WeightLogRow, GoalLogRow } from '../../data/rows'

export function isOnboardingComplete(
  profile: ProfileRow | null,
  latestWeight: WeightLogRow | null,
  latestGoal: GoalLogRow | null,
): boolean {
  return (
    profile != null &&
    profile.sex != null &&
    profile.date_of_birth != null &&
    profile.height_cm != null &&
    latestWeight != null &&
    latestGoal != null
  )
}
