import { toCsv } from '../../domain/csv'
import type { MesoSetRow } from '../../data/exportRepo'

const HEADERS = ['date', 'day', 'deload', 'exercise', 'muscle_group', 'set', 'weight', 'weight_unit', 'reps', 'rir']

/** Format meso set rows as CSV. `toWeight` converts kg to the display unit;
 * `weightUnit` is that unit's label (e.g. 'kg' | 'lb'); `formatDate` turns the
 * session ISO timestamp into a calendar date (inject a local formatter so the CSV
 * matches the dates shown in-app). */
export function mesoRowsToCsv(
  rows: MesoSetRow[],
  weightUnit: string,
  toWeight: (kg: number) => number,
  formatDate: (iso: string) => string,
): string {
  const matrix: (string | number)[][] = rows.map((r) => [
    formatDate(r.date),
    r.dayLabel ?? '',
    r.isDeload ? 'true' : 'false',
    r.exercise,
    r.muscleGroup ?? '',
    r.setNumber,
    toWeight(r.weightKg),
    weightUnit,
    r.reps,
    r.rir ?? '',
  ])
  return toCsv(HEADERS, matrix)
}
