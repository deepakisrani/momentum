export interface MealItem { name: string; perUnitCal: number; perUnitProtein: number; baseQty: number }
export interface Meal { key: 'breakfast' | 'lunch' | 'snack' | 'dinner'; items: MealItem[] }
export interface DayTemplate { meals: Meal[] }

export const VEG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [
      { name: 'whey scoop', perUnitCal: 120, perUnitProtein: 24, baseQty: 1 },
      { name: 'oats (40g)', perUnitCal: 150, perUnitProtein: 5, baseQty: 1 },
      { name: 'banana', perUnitCal: 105, perUnitProtein: 1, baseQty: 1 },
    ] },
    { key: 'lunch', items: [
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 3 },
      { name: 'katori dal', perUnitCal: 150, perUnitProtein: 9, baseQty: 1 },
      { name: 'katori sabzi', perUnitCal: 120, perUnitProtein: 4, baseQty: 1 },
      { name: 'bowl curd', perUnitCal: 100, perUnitProtein: 6, baseQty: 1 },
    ] },
    { key: 'snack', items: [
      { name: 'roasted chana (40g)', perUnitCal: 160, perUnitProtein: 8, baseQty: 1 },
      { name: 'paneer (50g)', perUnitCal: 130, perUnitProtein: 9, baseQty: 1 },
    ] },
    { key: 'dinner', items: [
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 3 },
      { name: 'katori rajma', perUnitCal: 180, perUnitProtein: 10, baseQty: 1 },
      { name: 'katori mixed veg', perUnitCal: 120, perUnitProtein: 4, baseQty: 1 },
      { name: 'bowl salad', perUnitCal: 50, perUnitProtein: 2, baseQty: 1 },
    ] },
  ],
}

export const EGG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [
      { name: 'boiled egg', perUnitCal: 78, perUnitProtein: 6, baseQty: 3 },
      { name: 'oats (40g)', perUnitCal: 150, perUnitProtein: 5, baseQty: 1 },
      { name: 'banana', perUnitCal: 105, perUnitProtein: 1, baseQty: 1 },
    ] },
    { key: 'lunch', items: [
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 3 },
      { name: 'katori dal', perUnitCal: 150, perUnitProtein: 9, baseQty: 1 },
      { name: 'katori sabzi', perUnitCal: 120, perUnitProtein: 4, baseQty: 1 },
      { name: 'bowl curd', perUnitCal: 100, perUnitProtein: 6, baseQty: 1 },
    ] },
    { key: 'snack', items: [
      { name: 'boiled egg', perUnitCal: 78, perUnitProtein: 6, baseQty: 2 },
      { name: 'roasted chana (40g)', perUnitCal: 160, perUnitProtein: 8, baseQty: 1 },
    ] },
    { key: 'dinner', items: [
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 3 },
      { name: 'katori rajma', perUnitCal: 180, perUnitProtein: 10, baseQty: 1 },
      { name: 'katori mixed veg', perUnitCal: 120, perUnitProtein: 4, baseQty: 1 },
      { name: 'bowl salad', perUnitCal: 50, perUnitProtein: 2, baseQty: 1 },
    ] },
  ],
}

export const NONVEG_DAY: DayTemplate = {
  meals: [
    { key: 'breakfast', items: [
      { name: 'boiled egg', perUnitCal: 78, perUnitProtein: 6, baseQty: 3 },
      { name: 'oats (40g)', perUnitCal: 150, perUnitProtein: 5, baseQty: 1 },
      { name: 'banana', perUnitCal: 105, perUnitProtein: 1, baseQty: 1 },
    ] },
    { key: 'lunch', items: [
      { name: 'chicken breast (100g)', perUnitCal: 165, perUnitProtein: 31, baseQty: 1 },
      { name: 'katori rice', perUnitCal: 200, perUnitProtein: 4, baseQty: 1 },
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 2 },
      { name: 'bowl salad', perUnitCal: 50, perUnitProtein: 2, baseQty: 1 },
    ] },
    { key: 'snack', items: [
      { name: 'whey scoop', perUnitCal: 120, perUnitProtein: 24, baseQty: 1 },
      { name: 'apple', perUnitCal: 95, perUnitProtein: 1, baseQty: 1 },
    ] },
    { key: 'dinner', items: [
      { name: 'fish fillet (120g)', perUnitCal: 180, perUnitProtein: 26, baseQty: 1 },
      { name: 'katori mixed veg', perUnitCal: 120, perUnitProtein: 4, baseQty: 1 },
      { name: 'chapati', perUnitCal: 70, perUnitProtein: 3, baseQty: 2 },
    ] },
  ],
}
