import { describe, it, expect } from 'vitest'
import { mesoRowsToCsv } from './mesoCsv'
import type { MesoSetRow } from '../../data/exportRepo'

const rows: MesoSetRow[] = [
  { date: '2026-07-08T06:00:00Z', dayLabel: 'Push', isDeload: true, exercise: 'Bench', muscleGroup: 'chest', setNumber: 1, weightKg: 60, reps: 8, rir: 2 },
  { date: '2026-07-08T06:00:00Z', dayLabel: null, isDeload: false, exercise: 'Row', muscleGroup: null, setNumber: 2, weightKg: 50, reps: 10, rir: null },
]

describe('mesoRowsToCsv', () => {
  it('writes the header, converts weight via the injected fn, and formats fields', () => {
    const csv = mesoRowsToCsv(rows, 'lb', (kg) => kg * 2, (iso) => iso.slice(0, 10)) // stub converter + date formatter
    const lines = csv.split('\n')
    expect(lines[0]).toBe('date,day,deload,exercise,muscle_group,set,weight,weight_unit,reps,rir')
    expect(lines[1]).toBe('2026-07-08,Push,true,Bench,chest,1,120,lb,8,2')
    expect(lines[2]).toBe('2026-07-08,,false,Row,,2,100,lb,10,')
  })
})
