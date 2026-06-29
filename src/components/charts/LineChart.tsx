import { useState } from 'react'
import { linScale, linePath, smoothPath } from './chartScale'
import type { ChartCurve } from '../../prefs/chartPref'

export interface ChartPoint { t: number; v: number } // t = epoch ms, v = display value

/** Reusable read-only line chart. Pure props (no context). */
export function LineChart({ points, formatValue, formatDate, yLabel, curve = 'straight' }: {
  points: ChartPoint[]
  formatValue: (v: number) => string
  formatDate: (t: number) => string
  yLabel?: string
  curve?: ChartCurve
}) {
  const [sel, setSel] = useState<number | null>(null)
  if (points.length === 0) return null

  const W = 320, H = 180, padL = 42, padR = 12, padT = 16, padB = 22
  const xs = points.map((p) => p.t)
  const ys = points.map((p) => p.v)
  const rawMin = Math.min(...ys), rawMax = Math.max(...ys)
  // Pad the y-domain so the line never touches the edges, and a flat series
  // (every value equal) sits centred rather than glued to the axis.
  const span = rawMax - rawMin
  const pad = span === 0 ? Math.max(Math.abs(rawMax) * 0.08, 1) : span * 0.15
  const yMin = rawMin - pad, yMax = rawMax + pad
  const yMid = (yMin + yMax) / 2

  const sx = linScale(Math.min(...xs), Math.max(...xs), padL, W - padR)
  const sy = linScale(yMin, yMax, H - padB, padT)
  const xy = points.map((p) => ({ x: sx(p.t), y: sy(p.v) }))
  const selected = sel != null ? points[sel] : null
  const lastI = points.length - 1

  const top = curve === 'smooth' ? smoothPath(xy) : linePath(xy)
  const area = points.length > 1
    ? `${top} L ${xy[lastI].x} ${H - padB} L ${xy[0].x} ${H - padB} Z`
    : ''
  const gridY = [padT, sy(yMid), H - padB]

  return (
    <div className="space-y-2">
      <div className="h-5 text-center text-sm font-medium text-slate-600 dark:text-slate-300">
        {selected ? `${formatDate(selected.t)} · ${formatValue(selected.v)}` : (yLabel ?? '')}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={yLabel ?? ''}>
        {/* gridlines + y labels (max / mid / min of the padded range) */}
        {gridY.map((gy, i) => (
          <line key={i} x1={padL} y1={gy} x2={W - padR} y2={gy} className="stroke-slate-200 dark:stroke-slate-700/60" strokeWidth="1" />
        ))}
        <text x="4" y={padT + 3} className="fill-slate-400 text-[9px]">{formatValue(yMax)}</text>
        <text x="4" y={sy(yMid) + 3} className="fill-slate-400 text-[9px]">{formatValue(yMid)}</text>
        <text x="4" y={H - padB + 3} className="fill-slate-400 text-[9px]">{formatValue(yMin)}</text>

        {area && <path d={area} className="fill-brand-600" fillOpacity="0.12" stroke="none" />}
        {points.length > 1 && <path d={top} fill="none" className="stroke-brand-600" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {xy.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={sel === i || i === lastI ? 5 : 3.5} className="fill-brand-600" style={{ cursor: 'pointer' }}
            tabIndex={0} role="button" aria-label={`${formatDate(points[i].t)}: ${formatValue(points[i].v)}`}
            onClick={() => setSel(i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(i) } }} />
        ))}
        <text x={padL} y={H - 5} className="fill-slate-400 text-[9px]">{formatDate(Math.min(...xs))}</text>
        <text x={W - padR} y={H - 5} textAnchor="end" className="fill-slate-400 text-[9px]">{formatDate(Math.max(...xs))}</text>
      </svg>
    </div>
  )
}
