const KG_PER_LB = 0.45359237
const CM_PER_IN = 2.54

export const kgToLb = (kg: number): number => kg / KG_PER_LB
export const lbToKg = (lb: number): number => lb * KG_PER_LB
export const cmToIn = (cm: number): number => cm / CM_PER_IN
export const inToCm = (inch: number): number => inch * CM_PER_IN
