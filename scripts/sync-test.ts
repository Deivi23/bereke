// Запуск: npx tsx scripts/sync-test.ts
// Два «устройства» с отдельными базами и общий «сервер» в памяти.
import 'fake-indexeddb/auto'
import {
  BerekeDB,
  balanceOf,
  convertLegacy,
  createStore,
  newProduct,
  type RemoteRow,
} from '../src/db'
import { createSyncEngine, type Remote } from '../src/sync'

class FakeServer implements Remote {
  rows = new Map<string, RemoteRow>()
  seq = 0
  reverseBatch = false
  pushes = 0
  async push(rows: RemoteRow[]) {
    this.pushes++
    const batch = this.reverseBatch ? [...rows].reverse() : rows
    for (const r of batch) this.rows.set(r.id, { ...structuredClone(r), seq: ++this.seq })
  }
  async pull(after: number, limit: number) {
    return [...this.rows.values()]
      .filter((r) => (r.seq ?? 0) > after)
      .sort((a, b) => a.seq! - b.seq!)
      .slice(0, limit)
      .map((r) => structuredClone(r))
  }
}

function device(name: string, server: FakeServer) {
  const db = new BerekeDB(name)
  const store = createStore(db)
  const engine = createSyncEngine(db, store, server)
  return { db, store, engine, sync: () => engine.syncNow() }
}

let failed = 0
function eq(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `  (ожидали ${JSON.stringify(expected)}, получили ${JSON.stringify(actual)})`}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const server = new FakeServer()
  const A = device('A', server)
  const B = device('B', server)

  // 1. A создаёт товар с остатком 10, B получает его
  const p = newProduct({ name: 'Молоко', barcodes: ['111'], sellPrice: 100, buyPrice: 70, stock: 10 })
  await A.store.saveProduct(p)
  await A.sync()
  await B.sync()
  eq((await B.db.products.get(p.id))?.stock, 10, '1. B получил товар с остатком 10')
  eq((await B.store.findByBarcode('111'))?.name, 'Молоко', '1. поиск по штрихкоду на B')

  // 2. Оба устройства продают одновременно, без связи
  const pa = (await A.db.products.get(p.id))!
  const pb = (await B.db.products.get(p.id))!
  await A.store.completeSale([{ product: pa, qty: 3, price: 100 }], { cash: 300, card: 0, debt: 0 })
  await B.store.completeSale([{ product: pb, qty: 4, price: 100 }], { cash: 400, card: 0, debt: 0 })
  eq([(await A.db.products.get(p.id))!.stock, (await B.db.products.get(p.id))!.stock], [7, 6], '2. до синхронизации каждый видит свой остаток')
  await A.sync()
  await B.sync()
  await A.sync()
  eq([(await A.db.products.get(p.id))!.stock, (await B.db.products.get(p.id))!.stock], [3, 3], '2. после синхронизации остаток 10 − 3 − 4 = 3 на обоих')
  eq([await A.db.sales.count(), await B.db.sales.count()], [2, 2], '2. обе продажи есть на обоих')

  // 3. Конфликт правки товара: побеждает более поздняя
  await A.store.saveProduct({ ...(await A.db.products.get(p.id))!, sellPrice: 120 })
  await sleep(5)
  await B.store.saveProduct({ ...(await B.db.products.get(p.id))!, sellPrice: 130, name: 'Молоко 3,2%' })
  await A.sync()
  await B.sync()
  await A.sync()
  const fa = (await A.db.products.get(p.id))!
  const fb = (await B.db.products.get(p.id))!
  eq([fa.sellPrice, fa.name, fb.sellPrice, fb.name], [130, 'Молоко 3,2%', 130, 'Молоко 3,2%'], '3. побеждает более поздняя правка, остаток не затёрт')
  eq([fa.stock, fb.stock], [3, 3], '3. остаток после правки цены прежний')

  // 4. Приход на B
  await B.store.commitReceipt('Поставщик', [{ product: fb, qty: 20, buyPrice: 75, sellPrice: 130 }])
  await B.sync()
  await A.sync()
  eq([(await A.db.products.get(p.id))!.stock, (await A.db.products.get(p.id))!.buyPrice], [23, 75], '4. приход виден на A: остаток 23, закупка 75')
  eq(await A.db.receipts.count(), 1, '4. приход записан на A')

  // 5. Долги: клиент и долг на A, оплата на B
  const c = await A.store.createCustomer('Айгуль', '+77011234567')
  await A.sync()
  await B.sync()
  const pa2 = (await A.db.products.get(p.id))!
  const saleId = await A.store.completeSale([{ product: pa2, qty: 2, price: 130 }], { cash: 60, card: 0, debt: 200, customerId: c.id })
  await A.sync()
  await B.sync()
  await B.store.addLedger(c.id, 'payment', 50, 'часть долга')
  await B.sync()
  await A.sync()
  eq(
    [balanceOf(await A.db.ledger.toArray()), balanceOf(await B.db.ledger.toArray())],
    [150, 150],
    '5. долг 200 − оплата 50 = 150 на обоих',
  )

  // 6. Отмена продажи на B (продажа сделана на A): остаток и долг возвращаются везде
  await B.store.voidSale(saleId)
  await B.sync()
  await A.sync()
  eq([(await A.db.products.get(p.id))!.stock, (await B.db.products.get(p.id))!.stock], [23, 23], '6. после отмены остаток вернулся (23) на обоих')
  eq(
    [balanceOf(await A.db.ledger.toArray()), balanceOf(await B.db.ledger.toArray())],
    [-50, -50],
    '6. долг от отменённой продажи убран (остаётся только оплата)',
  )
  eq(await A.db.sales.count(), 2, '6. отменённая продажа исчезла на A')

  // 7. Удаление товара
  const tmp = newProduct({ name: 'Лишний', barcodes: ['999'], stock: 1 })
  await A.store.saveProduct(tmp)
  await A.sync()
  await B.sync()
  eq(!!(await B.db.products.get(tmp.id)), true, '7. временный товар дошёл до B')
  await A.store.deleteProduct(tmp.id)
  await A.sync()
  await B.sync()
  eq(!!(await B.db.products.get(tmp.id)), false, '7. удаление товара дошло до B')

  // 8. Повторная синхронизация ничего не меняет
  const before = JSON.stringify([await A.db.products.toArray(), await A.db.moves.count()])
  await A.sync()
  await B.sync()
  await A.sync()
  eq(JSON.stringify([await A.db.products.toArray(), await A.db.moves.count()]), before, '8. повторная синхронизация идемпотентна')
  eq(await A.db.outbox.count(), 0, '8. очередь отправки пуста')

  // 9. Записи приходят «не по порядку»: сервер выдал движению номер меньше, чем товару
  const server2 = new FakeServer()
  server2.reverseBatch = true
  const C = device('C', server2)
  const D = device('D', server2)
  const q = newProduct({ name: 'Хлеб', barcodes: ['222'], stock: 0 })
  await C.store.saveProduct(q)
  await C.store.commitReceipt('Пекарня', [{ product: q, qty: 50, buyPrice: 40, sellPrice: 60 }])
  await C.sync()
  await D.sync()
  eq((await D.db.products.get(q.id))?.stock, 50, '9. движение пришло раньше товара — остаток всё равно 50')

  // 10. Запись с «опоздавшим» номером внутри запаса перечитывания
  const lateProduct = newProduct({ name: 'Поздний', barcodes: ['333'], stock: 5 })
  await C.store.saveProduct(lateProduct)
  await C.sync()
  await D.sync()
  const row = server2.rows.get(lateProduct.id)!
  const ghost = newProduct({ name: 'Опоздавший', barcodes: ['444'] })
  server2.rows.set(ghost.id, { id: ghost.id, kind: 'product', deleted: false, data: ghost, seq: row.seq! - 3 })
  await D.sync()
  eq(!!(await D.db.products.get(ghost.id)), true, '10. запись с номером чуть меньше курсора не потеряна')

  // 11. Перенос данных из старого формата (числовые id)
  const E = device('E', new FakeServer())
  const legacy = {
    products: [{ id: 1, barcodes: ['555'], name: 'Печенье', category: '', unit: 'pcs', buyPrice: 180, sellPrice: 250, stock: 10, minStock: 0, updatedAt: 1, priceChangedAt: 1, labelPrintedAt: 0 }],
    customers: [{ id: 1, name: 'Старый клиент', phone: '', createdAt: 1 }],
    sales: [{ id: 1, date: 2, items: [{ productId: 1, name: 'Печенье', qty: 2, price: 250, buyPrice: 180 }], total: 500, cash: 100, card: 0, debt: 400, customerId: 1 }],
    ledger: [{ id: 1, customerId: 1, date: 2, type: 'debt', amount: 400, saleId: 1, note: '' }],
    receipts: [],
  }
  await E.store.applyRows(convertLegacy(legacy), true)
  const ep = (await E.db.products.toArray())[0]
  eq([ep.stock, ep.name], [10, 'Печенье'], '11. старые данные перенесены, остаток сохранён')
  const el = (await E.db.ledger.toArray())[0]
  const ec = (await E.db.customers.toArray())[0]
  eq([el.customerId === ec.id, typeof el.id], [true, 'string'], '11. связи клиент–долг сохранились после смены id')
  eq((await E.db.outbox.count()) > 0, true, '11. перенесённые данные поставлены в очередь отправки')

  // 12. Массовый импорт и резервная копия
  const F = device('F', new FakeServer())
  await F.store.importProductsBulk(
    [newProduct({ name: 'Сахар', barcodes: ['777'], stock: 30, sellPrice: 500, unit: 'kg' }), newProduct({ name: 'Соль', barcodes: ['778'], stock: 0 })],
    [],
  )
  const json = await F.store.exportAll()
  const G = device('G', new FakeServer())
  const res = await G.store.importAll(json)
  eq([res.products, (await G.store.findByBarcode('777'))?.stock], [2, 30], '12. резервная копия загружается, остаток 30')
  await G.store.importAll(json)
  eq([await G.db.products.count(), await G.db.moves.count()], [2, 1], '12. повторная загрузка копии не дублирует данные')

  console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nВсе проверки пройдены')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
