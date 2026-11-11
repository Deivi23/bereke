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

  // 13. Смены, скидки, возвраты, быстрые кнопки
  const server3 = new FakeServer()
  const H = device('H', server3)
  const I = device('I', server3)
  const milk13 = newProduct({ name: 'Кефир', barcodes: ['901'], sellPrice: 500, buyPrice: 300, stock: 10 })
  await H.store.saveProduct(milk13)
  await H.sync()
  await I.sync()
  const sh13 = (await H.store.openShift(10000))!
  eq(await H.store.openShift(5), undefined, '13. вторую смену открыть нельзя, пока открыта первая')
  const sale13 = await H.store.completeSale([{ product: milk13, qty: 4, price: 500 }], { cash: 1000, card: 500, debt: 0, discount: 200 })
  const sl13 = (await H.db.sales.get(sale13))!
  eq([sl13.total, sl13.discount, sl13.shiftId === sh13.id], [1800, 200, true], '13. скидка вычтена из итога, продажа привязана к смене')
  const refundId = await H.store.createRefund(sale13, [{ productId: milk13.id, qty: 1 }], 'cash')
  eq((await H.db.refunds.get(refundId!))?.total, 450, '13. возврат считает скидку пропорционально (500 − 10%)')
  eq(await H.store.createRefund(sale13, [{ productId: milk13.id, qty: 10 }], 'cash').then(async (id) => (await H.db.refunds.get(id!))?.items[0].qty), 3, '13. нельзя вернуть больше, чем продано')
  eq(await H.store.createRefund(sale13, [{ productId: milk13.id, qty: 1 }], 'cash'), undefined, '13. всё уже возвращено — нового возврата нет')
  eq((await H.db.products.get(milk13.id))?.stock, 10, '13. после полного возврата остаток снова 10')
  await H.store.closeShift(sh13.id, 10900, 'ок')
  await H.sync()
  await I.sync()
  eq([(await I.db.sales.get(sale13))?.discount, await I.db.refunds.count()], [200, 2], '13. продажа со скидкой и возвраты дошли до второго устройства')
  eq([(await I.db.products.get(milk13.id))?.stock, (await I.db.shifts.get(sh13.id))?.countedCash], [10, 10900], '13. остаток и закрытая смена совпадают на втором устройстве')
  eq(await I.store.currentShift(), undefined, '13. закрытая смена не считается текущей')
  // Смена закрыта на I раньше, чем правка на H: побеждает более поздняя запись
  const s2 = (await H.store.openShift(0))!
  await H.sync()
  await I.sync()
  await sleep(5)
  await I.store.closeShift(s2.id, 0)
  await I.sync()
  await H.sync()
  eq(!!(await H.db.shifts.get(s2.id))?.closedAt, true, '13. закрытие смены на втором устройстве дошло до первого')
  await H.store.setQuick(milk13.id, true)
  await H.sync()
  await I.sync()
  eq((await I.db.products.get(milk13.id))?.quick, true, '13. быстрая кнопка синхронизируется')

  // 14. Склад: поставщики, списания, инвентаризация, сроки годности, переоценка
  const server4 = new FakeServer()
  const J = device('J', server4)
  const K = device('K', server4)
  const day = (n: number) => new Date(2030, 0, n).getTime()
  const rice = newProduct({ name: 'Рис', barcodes: ['902'], sellPrice: 800, buyPrice: 600, stock: 20, minStock: 5 })
  const salt = newProduct({ name: 'Соль', barcodes: ['903'], sellPrice: 150, buyPrice: 100, stock: 10 })
  await J.store.saveProduct(rice)
  await J.store.saveProduct(salt)
  const supId = await J.store.saveSupplier({ name: 'ИП Алмас', phone: '+77001112233' })
  await J.sync()
  await K.sync()
  eq((await K.db.suppliers.get(supId))?.name, 'ИП Алмас', '14. поставщик дошёл до второго устройства')

  // Приход со сроком годности и поставщиком
  await K.store.commitReceipt('ИП Алмас', [{ product: (await K.db.products.get(rice.id))!, qty: 10, buyPrice: 610, sellPrice: 800, expiry: day(20) }], supId)
  let r14 = (await K.db.products.get(rice.id))!
  eq([r14.stock, r14.expiry, r14.supplierId], [30, day(20), supId], '14. приход записал срок годности и поставщика')
  // Вторая партия со сроком позже: ближайший срок остаётся прежним
  await K.store.commitReceipt('', [{ product: r14, qty: 5, buyPrice: 610, sellPrice: 800, expiry: day(25) }])
  r14 = (await K.db.products.get(rice.id))!
  eq(r14.expiry, day(20), '14. более поздняя партия не сдвигает ближайший срок')

  // Списание
  const wo = await K.store.createWriteoff([{ product: r14, qty: 4 }, { product: (await K.db.products.get(salt.id))!, qty: 0 }], 'expired', 'просрочка')
  const w14 = (await K.db.writeoffs.get(wo!))!
  eq([w14.items.length, w14.total, (await K.db.products.get(rice.id))?.stock], [1, 2440, 31], '14. списание уменьшило остаток и посчитало потерю (нулевые позиции пропущены)')
  eq(await K.store.createWriteoff([], 'other'), undefined, '14. пустое списание не создаёт записей')
  await K.sync()
  await J.sync()
  eq([(await J.db.products.get(rice.id))?.stock, await J.db.writeoffs.count(), (await J.db.products.get(rice.id))?.expiry], [31, 1, day(20)], '14. списание и срок годности синхронизировались')

  // Списали весь остаток соли: срок годности сбрасывается
  const saltCur = (await J.db.products.get(salt.id))!
  await J.store.saveProduct({ ...saltCur, expiry: day(10) })
  await J.store.createWriteoff([{ product: (await J.db.products.get(salt.id))!, qty: 10 }], 'damaged')
  const saltAfter = (await J.db.products.get(salt.id))!
  eq([saltAfter.stock, saltAfter.expiry], [0, undefined], '14. после списания всего остатка срок годности убран')

  // Инвентаризация: насчитали 25 вместо 31 (недостача 6 по 610 закупки... закупка риса 610)
  await J.sync()
  await K.sync()
  const inv = await K.store.commitInventory([{ productId: rice.id, counted: 25 }])
  eq([inv?.shortage, inv?.surplus, (await K.db.products.get(rice.id))?.stock], [3660, 0, 25], '14. инвентаризация исправила остаток, недостача 6 × 610')
  const invRec = (await K.db.inventories.get(inv!.id))!
  eq([invRec.items[0].expected, invRec.items[0].counted], [31, 25], '14. в инвентаризации записано «было» и «стало»')
  await K.sync()
  await J.sync()
  eq([(await J.db.products.get(rice.id))?.stock, await J.db.inventories.count()], [25, 1], '14. инвентаризация синхронизировалась')
  eq(await J.store.commitInventory([]), undefined, '14. пустая инвентаризация ничего не делает')

  // Одновременно: J продаёт, K считает. Остатки сходятся через движения
  const riceJ = (await J.db.products.get(rice.id))!
  await J.store.completeSale([{ product: riceJ, qty: 2, price: 800 }], { cash: 1600, card: 0, debt: 0 })
  await K.store.commitInventory([{ productId: rice.id, counted: 20 }])
  await J.sync()
  await K.sync()
  await J.sync()
  const stockJ = (await J.db.products.get(rice.id))!.stock
  const stockK = (await K.db.products.get(rice.id))!.stock
  const sumMoves = (await J.db.moves.where('productId').equals(rice.id).toArray()).reduce((s, m) => s + m.delta, 0)
  eq([stockJ === stockK, stockJ === sumMoves], [true, true], '14. при одновременной продаже и инвентаризации остатки на устройствах совпадают с суммой движений')

  // Массовая переоценка
  await K.store.repriceProducts([{ id: rice.id, sellPrice: 900 }, { id: rice.id, sellPrice: 900 }])
  const repriced14 = (await K.db.products.get(rice.id))!
  eq([repriced14.sellPrice, repriced14.priceChangedAt > rice.priceChangedAt], [900, true], '14. переоценка меняет цену и помечает ценник к перепечати')
  await K.sync()
  await J.sync()
  eq((await J.db.products.get(rice.id))?.sellPrice, 900, '14. новая цена дошла до второго устройства')

  // Удаление поставщика синхронизируется
  await J.store.deleteSupplier(supId)
  await J.sync()
  await K.sync()
  eq(await K.db.suppliers.count(), 0, '14. удаление поставщика дошло до второго устройства')

  // Резервная копия содержит новые записи
  const L = device('L', new FakeServer())
  await L.store.importAll(await K.store.exportAll())
  eq([await L.db.writeoffs.count(), await L.db.inventories.count()], [2, 2], '14. резервная копия включает списания и инвентаризации')

  console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nВсе проверки пройдены')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
