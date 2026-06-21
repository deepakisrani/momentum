import { useProfileData } from './useProfileData'
import type { Units } from '../../domain/types'
import {
  weightUnitLabel,
  heightUnitLabel,
  toDisplayWeight,
  fromInputWeight,
  toDisplayHeight,
  fromInputHeight,
  formatWeight,
} from './unitsFormat'

export function useUnits() {
  const { profile } = useProfileData()
  const units: Units = profile?.units_pref ?? 'metric'
  return {
    units,
    weightLabel: weightUnitLabel(units),
    heightLabel: heightUnitLabel(units),
    toWeight: (kg: number) => toDisplayWeight(kg, units),
    fromWeight: (v: number) => fromInputWeight(v, units),
    toHeight: (cm: number) => toDisplayHeight(cm, units),
    fromHeight: (v: number) => fromInputHeight(v, units),
    fmtWeight: (kg: number) => formatWeight(kg, units),
  }
}
