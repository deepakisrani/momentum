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

/**
 * Smooth (Catmull-Rom → cubic-bezier) path through points. Falls back to a
 * straight `linePath` for fewer than 3 points (nothing to curve between).
 */
export function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 3) return linePath(points)
  const p = points
  const r = (n: number) => Math.round(n * 100) / 100
  let d = `M ${r(p[0].x)} ${r(p[0].y)}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${r(c1x)} ${r(c1y)}, ${r(c2x)} ${r(c2y)}, ${r(p2.x)} ${r(p2.y)}`
  }
  return d
}
