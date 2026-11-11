import { useState } from 'react'

export interface Bar {
  label: string
  /** Подпись на оси (может быть пустой, если места мало) */
  tick?: string
  value: number
  /** Текст в подсказке: значение крупно, подпись мелко */
  tip: string
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return m * p
}

const compact = (n: number) => {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)} млн`
  if (n >= 10_000) return `${Math.round(n / 1000)} тыс`
  return String(Math.round(n))
}

/** Столбчатая диаграмма: один ряд, тонкие столбцы со скруглённой вершиной, подсказка при наведении. */
export function BarChart({ bars, ariaLabel }: { bars: Bar[]; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const H = 220
  const padL = 44
  const padR = 8
  const padT = 10
  const padB = 24
  const max = niceMax(Math.max(...bars.map((b) => b.value), 0))
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const slot = innerW / Math.max(bars.length, 1)
  const bw = Math.min(24, slot - 2)
  const y = (v: number) => padT + innerH - (Math.max(v, 0) / max) * innerH
  const every = Math.ceil(bars.length / Math.max(1, Math.floor(innerW / 90)))
  const ticks = [0, 0.5, 1]

  const hb = hover !== null ? bars[hover] : null
  const hx = hover !== null ? padL + slot * hover + slot / 2 : 0

  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => {
          const v = max * t
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className="ch-grid" />
              <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="ch-axis">
                {compact(v)}
              </text>
            </g>
          )
        })}
        {bars.map((b, i) => {
          const cx = padL + slot * i + slot / 2
          const h = Math.max(innerH - (y(b.value) - padT), 0)
          const top = y(b.value)
          const r = Math.min(4, h, bw / 2)
          return (
            <g key={i}>
              {h > 0 && (
                <path
                  className={hover === i ? 'ch-bar hot' : 'ch-bar'}
                  d={`M${cx - bw / 2},${top + h} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${top + h} Z`}
                />
              )}
              {i % every === 0 && b.tick && (
                <text x={cx} y={H - 6} textAnchor="middle" className="ch-axis">
                  {b.tick}
                </text>
              )}
              <rect
                x={padL + slot * i}
                y={padT}
                width={slot}
                height={innerH + padB}
                fill="transparent"
                tabIndex={0}
                aria-label={`${b.label}: ${b.tip}`}
                onPointerMove={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          )
        })}
      </svg>
      {hb && (
        <div className="ch-tip" style={{ left: `${(hx / W) * 100}%` }}>
          <b className="num">{hb.tip}</b>
          <span>{hb.label}</span>
        </div>
      )}
    </div>
  )
}

export interface Segment {
  label: string
  value: number
  color: string
  text: string
}

/** Одна длинная полоса из сегментов (способы оплаты) с легендой. */
export function SegmentBar({ segments, ariaLabel }: { segments: Segment[]; ariaLabel: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  return (
    <div role="img" aria-label={ariaLabel}>
      <div className="seg-bar">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span key={s.label} style={{ flexGrow: s.value, background: s.color }} title={`${s.label}: ${s.text}`} />
          ))}
        {total === 0 && <span style={{ flexGrow: 1, background: 'var(--line)' }} />}
      </div>
      <ul className="seg-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.color }} />
            <span className="muted">{s.label}</span>
            <b className="num">{s.text}</b>
            <span className="muted num">{total > 0 ? `${Math.round((s.value / total) * 100)}%` : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Горизонтальные полосы для рейтинга: имя, полоса, значение. */
export function RankList({
  rows,
}: {
  rows: { key: string; name: string; sub?: string; value: number; text: string }[]
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ol className="rank">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="rank-top">
            <span className="rank-name">{r.name}</span>
            <b className="num">{r.text}</b>
          </div>
          <div className="rank-bar">
            <span style={{ width: `${Math.max((Math.max(r.value, 0) / max) * 100, 1)}%` }} />
          </div>
          {r.sub && <div className="rank-sub muted small">{r.sub}</div>}
        </li>
      ))}
    </ol>
  )
}
