/** Linear map from [dMin,dMax] to [rMin,rMax]; flat domain maps everything to rMin. */
export function linScale(dMin: number, dMax: number, rMin: number, rMax: number): (v: number) => number {
  if (dMax === dMin) return () => rMin
  const m = (rMax - rMin) / (dMax - dMin)
  return (v: number) => rMin + (v - dMin) * m
}

/** SVG path `d` through points; '' for empty, single moveto for one point. */
export function linePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}
