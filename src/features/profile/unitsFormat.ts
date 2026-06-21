import type { Units } from '../../domain/types'
import { kgToLb, lbToKg, cmToIn, inToCm } from '../../domain/units'

export const weightUnitLabel = (u: Units): string => (u === 'imperial' ? 'lb' : 'kg')
export const heightUnitLabel = (u: Units): string => (u === 'imperial' ? 'in' : 'cm')

/** Stored kg -> number shown in the user's unit (rounded for display). */
export function toDisplayWeight(kg: number, u: Units): number {
  return u === 'imperial' ? Math.round(kgToLb(kg) * 10) / 10 : Math.round(kg * 10) / 10
}

/** User-entered value in their unit -> kg for storage. */
export function fromInputWeight(value: number, u: Units): number {
  return u === 'imperial' ? lbToKg(value) : value
}

/** Stored cm -> number shown in the user's unit. */
export function toDisplayHeight(cm: number, u: Units): number {
  return u === 'imperial' ? Math.round(cmToIn(cm) * 10) / 10 : Math.round(cm)
}

export function fromInputHeight(value: number, u: Units): number {
  return u === 'imperial' ? inToCm(value) : value
}

/** Stored kg -> "<n> <unit>" for read-only display. */
export function formatWeight(kg: number, u: Units): string {
  return `${toDisplayWeight(kg, u)} ${weightUnitLabel(u)}`
}
