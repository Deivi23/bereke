// Запуск: npx tsx scripts/analytics-test.ts
import { computeAnalytics, fillDays, summarizeStock } from '../src/analytics'
import { newProduct, type Refund, type Sale } from '../src/db'

let failed = 0
function eq(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `  (ожидали ${JSON.stringify(expected)}, получили ${JSON.stringify(actual)})`}`)
}

const at = (d: number, h: number) => new Date(2026, 10, d, h, 30).getTime()
const item = (id: string, qty: number, price: number, buy: number) => ({ productId: id, name: id, qty, price, buyPrice: buy })
const sale = (id: string, date: number, items: ReturnType<typeof item>[], o: Partial<Sale> = {}): Sale => {
  const total = items.reduce((s, i) => s + Math.round(i.qty * i.price), 0) - (o.discount ?? 0)
  return { id, date, items, total, cash: total, card: 0, debt: 0, ...o }
}

// Хлеб: 10 шт по 250 (закупка 180), молоко: 2 по 560 (закупка 420), чай: 1 по 1450 (закупка 1100)
const sales: Sale[] = [
  sale('s1', at(10, 9), [item('bread', 10, 250, 180)]),
  sale('s2', at(10, 18), [item('milk', 2, 560, 420), item('tea', 1, 1450, 1100)], { discount: 100, cash: 0, card: 2470 - 100 }),
  sale('s3', at(11, 18), [item('bread', 4, 250, 180)], { cash: 0, debt: 1000, customerId: 'c' }),
]
const refunds: Refund[] = [{ id: 'r1', saleId: 's1', date: at(11, 10), items: [item('bread', 2, 250, 180)], total: 500, method: 'cash' }]

const a = computeAnalytics(sales, refunds)
// Выручка: 2500 + (2570-100) + 1000 − 500 возврат = 5470
eq(a.revenue, 5470, 'выручка после скидок и возвратов')
// Закупка: 1800 + (840+1100) + 720 − 360 = 4100
eq([a.cost, a.profit], [4100, 1370], 'себестоимость и прибыль учитывают возврат')
eq([a.salesCount, Math.round(a.avgCheck)], [3, 1990], 'чеков и средний чек (без вычета возвратов)')
eq(a.byMethod, { cash: 2500, card: 2370, debt: 1000 }, 'способы оплаты')
eq([a.discounts, a.refunds], [100, 500], 'скидки и возвраты')
eq(a.days.map((d) => [new Date(d.day).getDate(), d.revenue, d.count]), [[10, 4970, 2], [11, 500, 1]], 'выручка по дням (возврат вычтен в день возврата)')
eq([a.hours[9], a.hours[18], a.hourCounts[18]], [2500, 3470, 2], 'выручка по часам')
const bread = a.products.find((p) => p.id === 'bread')!
eq([bread.qty, Math.round(bread.revenue), Math.round(bread.profit)], [12, 3000, 840], 'товар: проданное минус возвращённое')
const tea = a.products.find((p) => p.id === 'tea')!
// скидка 100 раскладывается пропорционально: чай 1450 / 2570 * 2470
eq(Math.round(tea.revenue), 1394, 'скидка на чек раскладывается по позициям')
eq(a.products[0].abc, 'A', 'самый продаваемый товар — класс A')
eq(Math.round(a.products.reduce((s, p) => s + p.share, 0) * 100), 100, 'доли выручки в сумме 100%')

const empty = computeAnalytics([], [])
eq([empty.revenue, empty.marginPct, empty.avgCheck, empty.products.length], [0, 0, 0, 0], 'пустой период не ломает расчёт')

eq(fillDays(a.days, at(9, 0), at(12, 0) + 1).map((d) => new Date(d.day).getDate()), [9, 10, 11, 12], 'пропущенные дни заполняются нулями')

const ps = [
  newProduct({ name: 'Хлеб', stock: 10, buyPrice: 180, sellPrice: 250, minStock: 3 }),
  newProduct({ name: 'Соль', stock: 4, buyPrice: 100, sellPrice: 150, minStock: 5 }),
  newProduct({ name: 'Пусто', stock: 0, buyPrice: 50, sellPrice: 80 }),
]
const st = summarizeStock(ps, new Set([ps[0].id]))
eq([st.costValue, st.retailValue], [2200, 3100], 'стоимость остатков по закупке и по продаже')
eq([st.slow.map((x) => x.name), st.low.map((x) => x.name)], [['Соль'], ['Соль']], 'залежавшиеся и заканчивающиеся товары')

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nВсе проверки пройдены')
process.exit(failed ? 1 : 0)
