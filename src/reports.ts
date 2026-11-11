import { db, type Shift } from './db'

export interface ShiftReport {
  salesCount: number
  /** Выручка за вычетом скидок (то, что клиенты заплатили или взяли в долг) */
  revenue: number
  discounts: number
  cash: number
  card: number
  debt: number
  refundsCash: number
  refundsCard: number
  refundsDebt: number
  /** Оплаты старых долгов, принятые в смену */
  debtPaidCash: number
  debtPaidCard: number
  /** Сколько наличных должно быть в кассе */
  expectedCash: number
}

/** Итоги смены считаются из продаж, возвратов и оплат долгов, привязанных к смене. */
export async function shiftReport(shift: Shift): Promise<ShiftReport> {
  const [sales, refunds, ledger] = await Promise.all([
    db.sales.where('shiftId').equals(shift.id).toArray(),
    db.refunds.where('shiftId').equals(shift.id).toArray(),
    db.ledger.where('shiftId').equals(shift.id).toArray(),
  ])
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
  const payments = ledger.filter((e) => e.type === 'payment')
  const r: ShiftReport = {
    salesCount: sales.length,
    revenue: sum(sales.map((s) => s.total)),
    discounts: sum(sales.map((s) => s.discount ?? 0)),
    cash: sum(sales.map((s) => s.cash)),
    card: sum(sales.map((s) => s.card)),
    debt: sum(sales.map((s) => s.debt)),
    refundsCash: sum(refunds.filter((x) => x.method === 'cash').map((x) => x.total)),
    refundsCard: sum(refunds.filter((x) => x.method === 'card').map((x) => x.total)),
    refundsDebt: sum(refunds.filter((x) => x.method === 'debt').map((x) => x.total)),
    debtPaidCash: sum(payments.filter((e) => (e.method ?? 'cash') === 'cash').map((e) => e.amount)),
    debtPaidCard: sum(payments.filter((e) => e.method === 'card').map((e) => e.amount)),
    expectedCash: 0,
  }
  r.expectedCash = shift.openingCash + r.cash - r.refundsCash + r.debtPaidCash
  return r
}
