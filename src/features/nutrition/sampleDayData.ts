export type FoodRole = 'protein' | 'filler' | 'fixed'

export interface MealItem {
  name: string
  perUnitCal: number
  perUnitProtein: number
  perUnitFat: number
  baseQty: number
  // Planner tags (optional; default role 'fixed', min 1, max Infinity, finisher false):
  role?: FoodRole
  min?: number
  max?: number
  finisher?: boolean
}
export interface Meal { key: 'breakfast' | 'lunch' | 'snack' | 'dinner'; items: MealItem[] }
export interface DayTemplate { meals: Meal[] }

// Protein-forward templates for a lifting cut: chosen for a high protein:calorie
// ratio (~80-85 g protein per 1000 kcal). Fat is grams per unit (USDA / IFCT),
// kept under (cal - protein*4)/9 so derived carbs stay >= 0. Carbs are not stored
// — buildScaledDay derives them as the calorie remainder.
//
// role: 'protein' = lean top-up lever the planner ADDS (up to max); 'filler' =
// carb/energy food the planner TRIMS (down to min) to free calories on a cut;
// 'fixed' = staple that scales for calories but the protein optimizer leaves alone.
// finisher: true marks whey, added only after whole-food protein is exhausted.

const WHEY: MealItem = { name: 'whey scoop', perUnitCal: 120, perUnitProtein: 24, perUnitFat: 1.5, baseQty: 1, role: 'protein', min: 0, max: 3, finisher: true }
const OATS: MealItem = { name: 'oats (40g)', perUnitCal: 150, perUnitProtein: 5, perUnitFat: 3, baseQty: 1, role: 'filler', min: 0, max: 2 }
const EGG: MealItem = { name: 'boiled egg', perUnitCal: 78, perUnitProtein: 6, perUnitFat: 5.3, baseQty: 2, role: 'protein', min: 1, max: 4 }
const EGG_WHITE: MealItem = { name: 'egg white', perUnitCal: 18, perUnitProtein: 4, perUnitFat: 0, baseQty: 4, role: 'protein', min: 0, max: 8 }
const CHAPATI: MealItem = { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, perUnitFat: 0.5, baseQty: 3, role: 'filler', min: 1, max: 4 }
const DAL: MealItem = { name: 'katori dal', perUnitCal: 150, perUnitProtein: 9, perUnitFat: 5, baseQty: 1, role: 'fixed', min: 1, max: 2 }
const SOYA: MealItem = { name: 'soya chunks (30g)', perUnitCal: 100, perUnitProtein: 16, perUnitFat: 1, baseQty: 1, role: 'protein', min: 1, max: 3 }
const CURD: MealItem = { name: 'bowl curd', perUnitCal: 100, perUnitProtein: 6, perUnitFat: 5, baseQty: 1, role: 'fixed', min: 1, max: 2 }
const RAJMA: MealItem = { name: 'katori rajma', perUnitCal: 180, perUnitProtein: 10, perUnitFat: 6, baseQty: 1, role: 'fixed', min: 1, max: 2 }
const TOFU: MealItem = { name: 'tofu (100g)', perUnitCal: 120, perUnitProtein: 13, perUnitFat: 7, baseQty: 1, role: 'protein', min: 1, max: 2 }
const SALAD: MealItem = { name: 'bowl salad', perUnitCal: 50, perUnitProtein: 2, perUnitFat: 0.5, baseQty: 1, role: 'fixed', min: 1, max: 1 }
const CHICKEN: MealItem = { name: 'chicken breast (100g)', perUnitCal: 165, perUnitProtein: 31, perUnitFat: 4.5, baseQty: 1, role: 'protein', min: 1, max: 2 }
const RICE: MealItem = { name: 'katori rice', perUnitCal: 200, perUnitProtein: 4, perUnitFat: 0.5, baseQty: 1, role: 'filler', min: 0, max: 2 }
const MIXED_VEG: MealItem = { name: 'katori mixed veg', perUnitCal: 120, perUnitProtein: 4, perUnitFat: 7, baseQty: 1, role: 'fixed', min: 1, max: 1 }
const FISH: MealItem = { name: 'fish fillet (120g)', perUnitCal: 180, perUnitProtein: 26, perUnitFat: 8, baseQty: 1, role: 'protein', min: 1, max: 2 }

// baseQty is instance-specific; clone per placement so per-meal portions differ.
const at = (item: MealItem, baseQty: number): MealItem => ({ ...item, baseQty })

export const VEG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [at(WHEY, 1), at(OATS, 1)] },
    { key: 'lunch', items: [at(CHAPATI, 3), at(DAL, 1), at(SOYA, 1), at(CURD, 1)] },
    { key: 'snack', items: [at(WHEY, 1)] },
    { key: 'dinner', items: [at(CHAPATI, 3), at(RAJMA, 1), at(TOFU, 1), at(SALAD, 1)] },
  ],
}

export const EGG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [at(EGG, 2), at(EGG_WHITE, 4), at(OATS, 1)] },
    { key: 'lunch', items: [at(CHAPATI, 3), at(DAL, 1), at(EGG, 2), at(CURD, 1)] },
    { key: 'snack', items: [at(WHEY, 1)] },
    { key: 'dinner', items: [at(CHAPATI, 3), at(RAJMA, 1), at(EGG_WHITE, 6), at(SALAD, 1)] },
  ],
}

export const NONVEG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [at(EGG, 3), at(OATS, 1)] },
    { key: 'lunch', items: [at(CHICKEN, 1), at(RICE, 1), at(CHAPATI, 2), at(SALAD, 1)] },
    { key: 'snack', items: [at(WHEY, 1)] },
    { key: 'dinner', items: [at(FISH, 1), at(MIXED_VEG, 1), at(CHAPATI, 2)] },
  ],
}
