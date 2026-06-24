import { useState } from 'react'
import { linScale, linePath } from './chartScale'

export interface ChartPoint { t: number; v: number } // t = epoch ms, v = display value

/** Reusable read-only line chart. Pure props (no context). */
export function LineChart({ points, formatValue, formatDate, yLabel }: {
  points: ChartPoint[]
  formatValue: (v: number) => string
  formatDate: (t: number) => string
  yLabel?: string
}) {
  const [sel, setSel] = useState<number | null>(null)
  if (points.length === 0) return null

  const W = 320, H = 180, padL = 40, padR = 12, padT = 16, padB = 24
  const xs = points.map((p) => p.t)
  const ys = points.map((p) => p.v)
  const sx = linScale(Math.min(...xs), Math.max(...xs), padL, W - padR)
  const sy = linScale(Math.min(...ys), Math.max(...ys), H - padB, padT)
  const xy = points.map((p) => ({ x: sx(p.t), y: sy(p.v) }))
  const selected = sel != null ? points[sel] : null

  return (
    <div className="space-y-2">
      <div className="h-5 text-center text-sm font-medium text-slate-600 dark:text-slate-300">
        {selected ? `${formatDate(selected.t)} · ${formatValue(selected.v)}` : (yLabel ?? '')}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={yLabel ?? ''}>
        <text x="4" y={padT + 4} className="fill-slate-400 text-[9px]">{formatValue(Math.max(...ys))}</text>
        <text x="4" y={H - padB} className="fill-slate-400 text-[9px]">{formatValue(Math.min(...ys))}</text>
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
        {points.length > 1 && <path d={linePath(xy)} fill="none" className="stroke-brand-600" strokeWidth="2" />}
        {xy.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={sel === i ? 5 : 3.5} className="fill-brand-600" style={{ cursor: 'pointer' }}
            tabIndex={0} role="button" aria-label={`${formatDate(points[i].t)}: ${formatValue(points[i].v)}`}
            onClick={() => setSel(i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(i) } }} />
        ))}
        <text x={padL} y={H - 6} className="fill-slate-400 text-[9px]">{formatDate(Math.min(...xs))}</text>
        <text x={W - padR} y={H - 6} textAnchor="end" className="fill-slate-400 text-[9px]">{formatDate(Math.max(...xs))}</text>
      </svg>
    </div>
  )
}
