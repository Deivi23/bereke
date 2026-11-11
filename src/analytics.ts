import type { Product, Refund, Sale } from './db'

export interface ProductStat {
  id: string
  name: string
  category: string
  qty: number
  revenue: number
  profit: number
  /** Доля выручки, 0..1 */
  share: number
  /** ABC по выручке: A — первые 80%, B — до 95%, C — остальное */
  abc: 'A' | 'B' | 'C'
}

export interface DayStat {
  /** Начало дня (локальное время) */
  day: number
  revenue: number
  profit: number
  count: number
}

export interface Analytics {
  revenue: number
  cost: number
  profit: number
  /** Прибыль к выручке, % */
  marginPct: number
  salesCount: number
  avgCheck: number
  discounts: number
  refunds: number
  byMethod: { cash: number; card: number; debt: number }
  days: DayStat[]
  /** Выручка по часам суток 0..23 */
  hours: number[]
  hourCounts: number[]
  products: ProductStat[]
}

export const startOfDay = (ts: number) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

/**
 * Считает показатели по продажам и возвратам за период.
 * Выручка — после скидок и за вычетом возвратов; прибыль = выручка − закупка проданного.
 * Скидка на чек раскладывается по позициям пропорционально.
 */
export function computeAnalytics(sales: Sale[], refunds: Refund[], products: Product[] = []): Analytics {
  const meta = new Map(products.map((p) => [p.id, p]))
  const stats = new Map<string, { name: string; category: string; qty: number; revenue: number; cost: number }>()
  const bump = (id: string, name: string, qty: number, revenue: number, cost: number) => {
    const s = stats.get(id) ?? { name, category: meta.get(id)?.category ?? '', qty: 0, revenue: 0, cost: 0 }
    s.qty += qty
    s.revenue += revenue
    s.cost += cost
    stats.set(id, s)
  }
  const dayMap = new Map<number, DayStat>()
  const day = (ts: number) => {
    const k = startOfDay(ts)
    let d = dayMap.get(k)
    if (!d) dayMap.set(k, (d = { day: k, revenue: 0, profit: 0, count: 0 }))
    return d
  }
  const hours = new Array(24).fill(0)
  const hourCounts = new Array(24).fill(0)

  let revenue = 0
  let cost = 0
  const byMethod = { cash: 0, card: 0, debt: 0 }

  for (const s of sales) {
    const subtotal = sum(s.items.map((i) => Math.round(i.qty * i.price)))
    const k = subtotal > 0 ? s.total / subtotal : 1
    const c = sum(s.items.map((i) => i.qty * i.buyPrice))
    revenue += s.total
    cost += c
    byMethod.cash += s.cash
    byMethod.card += s.card
    byMethod.debt += s.debt
    for (const i of s.items) bump(i.productId, i.name, i.qty, i.qty * i.price * k, i.qty * i.buyPrice)
    const d = day(s.date)
    d.revenue += s.total
    d.profit += s.total - c
    d.count += 1
    const h = new Date(s.date).getHours()
    hours[h] += s.total
    hourCounts[h] += 1
  }

  let refundTotal = 0
  for (const r of refunds) {
    const gross = sum(r.items.map((i) => Math.round(i.qty * i.price)))
    const k = gross > 0 ? r.total / gross : 1
    const c = sum(r.items.map((i) => i.qty * i.buyPrice))
    refundTotal += r.total
    revenue -= r.total
    cost -= c
    for (const i of r.items) bump(i.productId, i.name, -i.qty, -i.qty * i.price * k, -i.qty * i.buyPrice)
    const d = day(r.date)
    d.revenue -= r.total
    d.profit -= r.total - c
  }

  const list = [...stats.entries()]
    .map(([id, s]) => ({ id, name: s.name, category: s.category, qty: s.qty, revenue: s.revenue, profit: s.revenue - s.cost }))
    .filter((p) => p.qty > 0 || p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
  const totalRev = sum(list.map((p) => p.revenue))
  let acc = 0
  const productStats: ProductStat[] = list.map((p) => {
    const before = totalRev > 0 ? acc / totalRev : 0
    acc += p.revenue
    // Товар относится к A, пока накопленная до него доля меньше 80%, и т. д.
    const abc = before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C'
    return { ...p, revenue: Math.round(p.revenue), profit: Math.round(p.profit), share: totalRev > 0 ? p.revenue / totalRev : 0, abc }
  })

  const profit = revenue - cost
  return {
    revenue,
    cost: Math.round(cost),
    profit: Math.round(profit),
    marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    salesCount: sales.length,
    avgCheck: sales.length ? sum(sales.map((s) => s.total)) / sales.length : 0,
    discounts: sum(sales.map((s) => s.discount ?? 0)),
    refunds: refundTotal,
    byMethod,
    days: [...dayMap.values()].sort((a, b) => a.day - b.day),
    hours,
    hourCounts,
    products: productStats,
  }
}

/** Заполняет пропущенные дни нулями, чтобы на графике не было дыр. */
export function fillDays(days: DayStat[], from: number, to: number): DayStat[] {
  const map = new Map(days.map((d) => [d.day, d]))
  const out: DayStat[] = []
  const d = new Date(startOfDay(from))
  const end = startOfDay(to - 1)
  while (d.getTime() <= end && out.length < 400) {
    const k = d.getTime()
    out.push(map.get(k) ?? { day: k, revenue: 0, profit: 0, count: 0 })
    d.setDate(d.getDate() + 1)
  }
  return out
}

export interface StockSummary {
  /** Деньги, вложенные в остатки (по закупке) */
  costValue: number
  /** Сколько остатки стоят по цене продажи */
  retailValue: number
  /** Товары с остатком, которые не продавались в период, самые «дорогие» сверху */
  slow: { id: string; name: string; stock: number; frozen: number }[]
  /** Товары ниже минимального остатка */
  low: Product[]
}

export function summarizeStock(products: Product[], soldIds: Set<string>): StockSummary {
  const stocked = products.filter((p) => p.stock > 0)
  return {
    costValue: sum(stocked.map((p) => p.stock * p.buyPrice)),
    retailValue: sum(stocked.map((p) => p.stock * p.sellPrice)),
    slow: stocked
      .filter((p) => !soldIds.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, stock: p.stock, frozen: p.stock * p.buyPrice }))
      .sort((a, b) => b.frozen - a.frozen),
    low: products.filter((p) => p.minStock > 0 && p.stock <= p.minStock),
  }
}
