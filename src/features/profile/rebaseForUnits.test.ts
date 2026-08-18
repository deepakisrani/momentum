import { describe, it, expect } from 'vitest'
import {
  rebaseWeightForUnits, rebaseHeightForUnits, HEIGHT_MIN, HEIGHT_MAX,
} from './rebaseForUnits'
import { fromInputHeight, fromInputWeight } from './unitsFormat'
import { defaultAnchor, WHEEL_MAX, WHEEL_MIN } from './weightWheel'

describe('rebaseWeightForUnits', () => {
  it('leaves the value untouched when the units do not change', () => {
    expect(rebaseWeightForUnits(82.5, 'metric', 'metric')).toBe(82.5)
    expect(rebaseWeightForUnits(181.9, 'imperial', 'imperial')).toBe(181.9)
  })

  it('converts kg to lb', () => {
    expect(rebaseWeightForUnits(80, 'metric', 'imperial')).toBe(176.4)
  })

  it('converts lb to kg', () => {
    expect(rebaseWeightForUnits(176.4, 'imperial', 'metric')).toBe(80)
  })

  it('converts the metric default to the imperial one, to a tenth', () => {
    // 154.3 rather than defaultAnchor('imperial') === 154: converting is the rule, and the
    // 0.3 lb is the honest restatement of 70.0 kg.
    expect(rebaseWeightForUnits(defaultAnchor('metric'), 'metric', 'imperial')).toBeCloseTo(defaultAnchor('imperial'), 0)
  })

  it('rebases to a value the wheel can actually land on (0.1 grid)', () => {
    for (const kg of [55, 70, 82.5, 91.3, 120.7]) {
      const lb = rebaseWeightForUnits(kg, 'metric', 'imperial')
      expect(lb).toBe(Math.round(lb * 10) / 10)
    }
  })

  it('round-trips kg -> lb -> kg exactly, so toggling twice cannot drift the weight', () => {
    for (const kg of [20, 48.6, 55, 70, 82.5, 91.3, 120.7, 181]) {
      const there = rebaseWeightForUnits(kg, 'metric', 'imperial')
      expect(rebaseWeightForUnits(there, 'imperial', 'metric')).toBe(kg)
    }
  })

  it('round-trips lb -> kg -> lb within a tenth of a pound', () => {
    // Not exact in this direction: a 0.1 kg step is ~0.22 lb, so the kg grid cannot hold
    // every tenth of a pound. The drift is bounded by one kg step.
    for (const lb of [100, 154, 176.4, 181.9, 200.4, 395]) {
      const back = rebaseWeightForUnits(rebaseWeightForUnits(lb, 'imperial', 'metric'), 'metric', 'imperial')
      expect(Math.abs(back - lb)).toBeLessThanOrEqual(0.15)
    }
  })

  it('preserves the stored kg through a switch', () => {
    // The property that matters: what gets written to weight_log is what the user picked.
    const picked = 82.5
    const rebased = rebaseWeightForUnits(picked, 'metric', 'imperial')
    expect(fromInputWeight(rebased, 'imperial')).toBeCloseTo(picked, 1)
  })

  it('clamps a conversion that overshoots the wheel ceiling', () => {
    expect(rebaseWeightForUnits(WHEEL_MAX, 'metric', 'imperial')).toBe(WHEEL_MAX)
  })

  it('clamps an imperial weight whose kg value falls under the wheel floor', () => {
    // The documented low-end boundary: below 44.1 lb (= 20 kg) the raw conversion leaves the
    // wheel's range. 30 lb is really 13.6 kg.
    expect(rebaseWeightForUnits(30, 'imperial', 'metric')).toBe(WHEEL_MIN)
    expect(rebaseWeightForUnits(WHEEL_MIN, 'imperial', 'metric')).toBe(WHEEL_MIN)
  })

  it('does not clamp just above that boundary', () => {
    expect(rebaseWeightForUnits(44.1, 'imperial', 'metric')).toBe(20)
    expect(rebaseWeightForUnits(45, 'imperial', 'metric')).toBeGreaterThan(WHEEL_MIN)
  })

  it('never returns a non-finite number, even for one', () => {
    expect(rebaseWeightForUnits(Number.NaN, 'metric', 'imperial')).toBe(WHEEL_MIN)
  })
})

describe('rebaseHeightForUnits', () => {
  it('leaves the value untouched when the units do not change', () => {
    expect(rebaseHeightForUnits('175', 'metric', 'metric')).toBe('175')
    expect(rebaseHeightForUnits('68.9', 'imperial', 'imperial')).toBe('68.9')
  })

  it('leaves an unanswered field exactly as it is', () => {
    // The field is a string precisely because it can be empty mid-form. Turning that into "0"
    // or a default would put a height the user never gave into the profile.
    expect(rebaseHeightForUnits('', 'metric', 'imperial')).toBe('')
    expect(rebaseHeightForUnits('   ', 'metric', 'imperial')).toBe('   ')
    expect(rebaseHeightForUnits('', 'imperial', 'metric')).toBe('')
  })

  it('leaves text it cannot parse exactly as it is', () => {
    expect(rebaseHeightForUnits('17a', 'metric', 'imperial')).toBe('17a')
    expect(rebaseHeightForUnits('.', 'metric', 'imperial')).toBe('.')
    expect(rebaseHeightForUnits('-', 'imperial', 'metric')).toBe('-')
  })

  it('converts cm to in', () => {
    expect(rebaseHeightForUnits('175', 'metric', 'imperial')).toBe('68.9')
  })

  it('converts in to cm', () => {
    expect(rebaseHeightForUnits('70', 'imperial', 'metric')).toBe('178')
  })

  it('no longer reads an imperial height as a metric one', () => {
    // The bug: 50-96 as inches is 4'2"-8'0", the whole human range, and it is also inside the
    // metric input's 50-260, so "70 in" switched to metric passed validation as a 70 cm adult.
    const asMetric = rebaseHeightForUnits('70', 'imperial', 'metric')
    expect(asMetric).not.toBe('70')
    expect(fromInputHeight(Number(asMetric), 'metric')).toBeCloseTo(fromInputHeight(70, 'imperial'), 0)
  })

  it('round-trips cm -> in -> cm exactly wherever the ranges overlap', () => {
    // Exact in this direction: 0.1 in is 0.254 cm, finer than the 1 cm grid. Only up to 243 cm
    // though — above that the inch value passes 96 and the clamp, not the rounding, decides
    // (260 cm returns as 244, being 96 in). That is the clamp doing its job, not drift.
    for (const cm of ['140', '160', '175', '178', '183', '200', '243']) {
      const there = rebaseHeightForUnits(cm, 'metric', 'imperial')
      expect(rebaseHeightForUnits(there, 'imperial', 'metric')).toBe(cm)
    }
    expect(rebaseHeightForUnits(rebaseHeightForUnits('260', 'metric', 'imperial'), 'imperial', 'metric')).toBe('244')
  })

  it('round-trips in -> cm -> in within a quarter inch', () => {
    // 1 cm is 0.394 in, so the cm grid cannot hold every tenth of an inch. Bound: half a
    // centimetre (0.197 in) from the cm rounding, plus 0.05 in from the display rounding.
    for (const inches of ['60', '65.5', '68.9', '70', '72.4', '80']) {
      const back = rebaseHeightForUnits(rebaseHeightForUnits(inches, 'imperial', 'metric'), 'metric', 'imperial')
      expect(Math.abs(Number(back) - Number(inches))).toBeLessThanOrEqual(0.25)
    }
  })

  it('lands inside the target input\'s own min/max, in both directions', () => {
    // The point of the clamp: after a switch the field is always submittable. Before it, the
    // common path (175 cm -> imperial) kept "175" and the input rejected it as over max.
    for (const cm of ['50', '120', '175', '200', '260']) {
      const inches = Number(rebaseHeightForUnits(cm, 'metric', 'imperial'))
      expect(inches).toBeGreaterThanOrEqual(HEIGHT_MIN.imperial)
      expect(inches).toBeLessThanOrEqual(HEIGHT_MAX.imperial)
    }
    for (const inches of ['20', '48', '68.9', '96']) {
      const cm = Number(rebaseHeightForUnits(inches, 'imperial', 'metric'))
      expect(cm).toBeGreaterThanOrEqual(HEIGHT_MIN.metric)
      expect(cm).toBeLessThanOrEqual(HEIGHT_MAX.metric)
    }
  })

  it('clamps a metric height whose inch value leaves the imperial range', () => {
    expect(rebaseHeightForUnits('260', 'metric', 'imperial')).toBe(String(HEIGHT_MAX.imperial))
    expect(rebaseHeightForUnits('50', 'metric', 'imperial')).toBe(String(HEIGHT_MIN.imperial))
  })

  it('pulls an out-of-range entry into range rather than carrying it across', () => {
    // "0" and "400" are already rejected by the input's own min/max; a switch normalizes them
    // instead of converting them into a different out-of-range number.
    expect(rebaseHeightForUnits('0', 'metric', 'imperial')).toBe(String(HEIGHT_MIN.imperial))
    expect(rebaseHeightForUnits('400', 'metric', 'imperial')).toBe(String(HEIGHT_MAX.imperial))
  })

  it('returns a whole number of centimetres and a tenth of an inch', () => {
    expect(rebaseHeightForUnits('68.9', 'imperial', 'metric')).toBe('175')
    expect(rebaseHeightForUnits('177', 'metric', 'imperial')).toBe('69.7')
  })
})
