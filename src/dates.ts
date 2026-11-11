/** Дата из поля <input type="date"> («2026-11-30») → начало этого дня по местному времени. */
export function parseDate(s: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
}

export function toInputDate(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const DAY = 864e5

/** Сколько целых дней до даты (отрицательное — уже прошла). */
export function daysUntil(ts: number, now = Date.now()): number {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return Math.round((ts - today.getTime()) / DAY)
}

export function fmtDay(ts: number): string {
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}
