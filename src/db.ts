import Dexie, { type DexieOptions, type Table } from 'dexie'

export type Unit = 'pcs' | 'kg'
export type Kind = 'product' | 'receipt' | 'customer' | 'sale' | 'ledger' | 'move'

export interface Product {
  id: string
  /** Один товар может иметь несколько штрихкодов (штучный, коробка и т.д.) */
  barcodes: string[]
  name: string
  category: string
  unit: Unit
  buyPrice: number
  sellPrice: number
  /** Кэш остатка. Истина — сумма движений (moves); поле меняется только через движения. */
  stock: number
  minStock: number
  updatedAt: number
  /** Когда цена менялась в последний раз (для перепечати ценников) */
  priceChangedAt: number
  /** Когда ценник печатали в последний раз */
  labelPrintedAt: number
}

export interface ReceiptItem {
  productId: string
  name: string
  qty: number
  buyPrice: number
}

export interface Receipt {
  id: string
  date: number
  supplier: string
  items: ReceiptItem[]
  total: number
}

export interface Customer {
  id: string
  name: string
  phone: string
  createdAt: number
  updatedAt: number
}

export interface SaleItem {
  productId: string
  name: string
  qty: number
  price: number
  /** Закупочная цена на момент продажи — нужна для расчёта прибыли */
  buyPrice: number
}

export interface Sale {
  id: string
  date: number
  items: SaleItem[]
  total: number
  cash: number
  card: number
  debt: number
  customerId?: string
}

/** Запись в долговой книге: долг клиента или его оплата. */
export interface LedgerEntry {
  id: string
  customerId: string
  date: number
  type: 'debt' | 'payment'
  amount: number
  saleId?: string
  note: string
}

/** Неизменяемое движение остатка: приход, продажа, корректировка. */
export interface StockMove {
  id: string
  productId: string
  delta: number
  date: number
  reason: 'initial' | 'adjust' | 'receipt' | 'sale'
  refId?: string
}

/** Что нужно отправить на сервер. */
export interface OutboxItem {
  key: string
  kind: Kind
  id: string
  deleted: boolean
  /** Метка версии: если запись изменили во время отправки, метка не совпадёт и запись останется в очереди */
  ts: number
}

/** Запись в формате обмена с сервером. */
export interface RemoteRow {
  id: string
  kind: Kind
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  deleted: boolean
  seq?: number
}

export const KIND_TABLE = {
  product: 'products',
  receipt: 'receipts',
  customer: 'customers',
  sale: 'sales',
  ledger: 'ledger',
  move: 'moves',
} as const

const KIND_ORDER: Kind[] = ['product', 'customer', 'receipt', 'sale', 'ledger', 'move']

export class BerekeDB extends Dexie {
  products!: Table<Product, string>
  receipts!: Table<Receipt, string>
  customers!: Table<Customer, string>
  sales!: Table<Sale, string>
  ledger!: Table<LedgerEntry, string>
  moves!: Table<StockMove, string>
  outbox!: Table<OutboxItem, string>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor(name = 'bereke3', options?: DexieOptions) {
    super(name, options)
    this.version(1).stores({
      products: 'id, *barcodes, name, category, stock, priceChangedAt',
      receipts: 'id, date',
      customers: 'id, name',
      sales: 'id, date, customerId',
      ledger: 'id, customerId, date, saleId',
      moves: 'id, productId, refId',
      outbox: 'key',
      meta: 'key',
    })
  }
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function newProduct(partial: Partial<Product> = {}): Product {
  const now = Date.now()
  return {
    id: uuid(),
    barcodes: [],
    name: '',
    category: '',
    unit: 'pcs',
    buyPrice: 0,
    sellPrice: 0,
    stock: 0,
    minStock: 0,
    updatedAt: now,
    priceChangedAt: now,
    labelPrintedAt: 0,
    ...partial,
  }
}

export function balanceOf(entries: LedgerEntry[]): number {
  return entries.reduce((s, e) => s + (e.type === 'debt' ? e.amount : -e.amount), 0)
}

export interface SaleLine {
  product: Product
  qty: number
  price: number
}

/** Данные старого формата (числовые id) -> записи нового формата (uuid). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertLegacy(data: any): RemoteRow[] {
  const rows: RemoteRow[] = []
  const now = Date.now()
  const pm = new Map<unknown, string>()
  const cm = new Map<unknown, string>()
  const sm = new Map<unknown, string>()

  for (const p of data.products ?? []) {
    const id = uuid()
    pm.set(p.id, id)
    rows.push({ kind: 'product', id, deleted: false, data: { ...p, id, stock: 0 } })
    if (p.stock) {
      const mid = uuid()
      rows.push({
        kind: 'move',
        id: mid,
        deleted: false,
        data: { id: mid, productId: id, delta: p.stock, date: p.updatedAt ?? now, reason: 'initial' },
      })
    }
  }
  for (const c of data.customers ?? []) {
    const id = uuid()
    cm.set(c.id, id)
    rows.push({ kind: 'customer', id, deleted: false, data: { ...c, id, updatedAt: c.createdAt ?? now } })
  }
  for (const r of data.receipts ?? []) {
    const id = uuid()
    rows.push({
      kind: 'receipt',
      id,
      deleted: false,
      data: { ...r, id, items: (r.items ?? []).map((i: ReceiptItem) => ({ ...i, productId: pm.get(i.productId) ?? String(i.productId) })) },
    })
  }
  for (const s of data.sales ?? []) {
    const id = uuid()
    sm.set(s.id, id)
    rows.push({
      kind: 'sale',
      id,
      deleted: false,
      data: {
        ...s,
        id,
        customerId: s.customerId != null ? cm.get(s.customerId) : undefined,
        items: (s.items ?? []).map((i: SaleItem) => ({ ...i, productId: pm.get(i.productId) ?? String(i.productId) })),
      },
    })
  }
  for (const e of data.ledger ?? []) {
    const id = uuid()
    rows.push({
      kind: 'ledger',
      id,
      deleted: false,
      data: { ...e, id, customerId: cm.get(e.customerId) ?? String(e.customerId), saleId: e.saleId != null ? sm.get(e.saleId) : undefined },
    })
  }
  return rows
}

export type Store = ReturnType<typeof createStore>

/** Все операции с данными. Принимает базу, чтобы в тестах можно было создать «два устройства». */
export function createStore(db: BerekeDB) {
  const ALL = () => [db.products, db.receipts, db.customers, db.sales, db.ledger, db.moves, db.outbox]

  const queue = (kind: Kind, id: string, deleted = false) =>
    db.outbox.put({ key: `${kind}:${id}`, kind, id, deleted, ts: Date.now() + Math.random() })

  async function bumpStock(productId: string, delta: number) {
    const p = await db.products.get(productId)
    if (p) {
      p.stock = round3(p.stock + delta)
      await db.products.put(p)
    }
  }

  /** Записывает движение остатка. Вызывать только внутри транзакции. */
  async function addMove(productId: string, delta: number, reason: StockMove['reason'], refId?: string) {
    const m: StockMove = { id: uuid(), productId, delta, date: Date.now(), reason, refId }
    await db.moves.add(m)
    await queue('move', m.id)
    await bumpStock(productId, delta)
  }

  const findByBarcode = (code: string) => db.products.where('barcodes').equals(code.trim()).first()

  /** Сохраняет товар. Остаток меняется через движение «корректировка». */
  async function saveProduct(input: Product): Promise<string> {
    return db.transaction('rw', ALL(), async () => {
      const now = Date.now()
      const old = await db.products.get(input.id)
      const p: Product = {
        ...input,
        updatedAt: now,
        barcodes: [...new Set(input.barcodes.map((b) => b.trim()).filter(Boolean))],
      }
      if (old) {
        p.priceChangedAt = old.sellPrice !== p.sellPrice ? now : old.priceChangedAt
        const delta = round3(input.stock - old.stock)
        p.stock = old.stock
        await db.products.put(p)
        if (delta !== 0) await addMove(p.id, delta, 'adjust')
      } else {
        const want = input.stock
        p.priceChangedAt = now
        p.stock = 0
        await db.products.put(p)
        if (want !== 0) await addMove(p.id, want, 'initial')
      }
      await queue('product', p.id)
      return p.id
    })
  }

  async function deleteProduct(id: string) {
    await db.transaction('rw', ALL(), async () => {
      await db.products.delete(id)
      await queue('product', id, true)
    })
  }

  async function markLabelsPrinted(ids: string[]) {
    await db.transaction('rw', ALL(), async () => {
      const now = Date.now()
      for (const id of ids) {
        const p = await db.products.get(id)
        if (!p) continue
        p.labelPrintedAt = now
        p.updatedAt = now
        await db.products.put(p)
        await queue('product', id)
      }
    })
  }

  /** Проводит приход товара: увеличивает остатки, обновляет закупочные цены. */
  async function commitReceipt(
    supplier: string,
    lines: { product: Product; qty: number; buyPrice: number; sellPrice: number }[],
  ): Promise<void> {
    await db.transaction('rw', ALL(), async () => {
      const now = Date.now()
      const receiptId = uuid()
      for (const l of lines) {
        const cur = await db.products.get(l.product.id)
        if (!cur) continue
        cur.buyPrice = l.buyPrice
        if (cur.sellPrice !== l.sellPrice) {
          cur.sellPrice = l.sellPrice
          cur.priceChangedAt = now
        }
        cur.updatedAt = now
        await db.products.put(cur)
        await queue('product', cur.id)
        await addMove(cur.id, l.qty, 'receipt', receiptId)
      }
      await db.receipts.add({
        id: receiptId,
        date: now,
        supplier: supplier.trim(),
        total: lines.reduce((s, l) => s + l.qty * l.buyPrice, 0),
        items: lines.map((l) => ({ productId: l.product.id, name: l.product.name, qty: l.qty, buyPrice: l.buyPrice })),
      })
      await queue('receipt', receiptId)
    })
  }

  /** Проводит продажу: списывает остатки, при долге записывает его в книгу клиента. */
  async function completeSale(
    lines: SaleLine[],
    pay: { cash: number; card: number; debt: number; customerId?: string },
  ): Promise<string> {
    const total = lines.reduce((s, l) => s + Math.round(l.qty * l.price), 0)
    return db.transaction('rw', ALL(), async () => {
      const now = Date.now()
      const saleId = uuid()
      for (const l of lines) await addMove(l.product.id, -l.qty, 'sale', saleId)
      const names = lines.map((l) => l.product.name)
      const note = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '')
      await db.sales.add({
        id: saleId,
        date: now,
        total,
        cash: pay.cash,
        card: pay.card,
        debt: pay.debt,
        customerId: pay.customerId,
        items: lines.map((l) => ({
          productId: l.product.id,
          name: l.product.name,
          qty: l.qty,
          price: l.price,
          buyPrice: l.product.buyPrice,
        })),
      })
      await queue('sale', saleId)
      if (pay.debt > 0 && pay.customerId) {
        const eid = uuid()
        await db.ledger.add({ id: eid, customerId: pay.customerId, date: now, type: 'debt', amount: pay.debt, saleId, note })
        await queue('ledger', eid)
      }
      return saleId
    })
  }

  /** Отмена продажи: возвращает товар на склад и убирает долг. */
  async function voidSale(saleId: string): Promise<void> {
    await db.transaction('rw', ALL(), async () => {
      const sale = await db.sales.get(saleId)
      if (!sale) return
      const moves = await db.moves.where('refId').equals(saleId).toArray()
      for (const m of moves) {
        await bumpStock(m.productId, -m.delta)
        await db.moves.delete(m.id)
        await queue('move', m.id, true)
      }
      const entries = await db.ledger.where('saleId').equals(saleId).toArray()
      for (const e of entries) {
        await db.ledger.delete(e.id)
        await queue('ledger', e.id, true)
      }
      await db.sales.delete(saleId)
      await queue('sale', saleId, true)
    })
  }

  async function createCustomer(name: string, phone: string): Promise<Customer> {
    const now = Date.now()
    const c: Customer = { id: uuid(), name: name.trim(), phone: phone.trim(), createdAt: now, updatedAt: now }
    await db.transaction('rw', ALL(), async () => {
      await db.customers.add(c)
      await queue('customer', c.id)
    })
    return c
  }

  async function updateCustomer(id: string, patch: { name: string; phone: string }) {
    await db.transaction('rw', ALL(), async () => {
      const c = await db.customers.get(id)
      if (!c) return
      await db.customers.put({ ...c, name: patch.name.trim(), phone: patch.phone.trim(), updatedAt: Date.now() })
      await queue('customer', id)
    })
  }

  async function deleteCustomer(id: string) {
    await db.transaction('rw', ALL(), async () => {
      const entries = await db.ledger.where('customerId').equals(id).toArray()
      for (const e of entries) {
        await db.ledger.delete(e.id)
        await queue('ledger', e.id, true)
      }
      await db.customers.delete(id)
      await queue('customer', id, true)
    })
  }

  async function addLedger(customerId: string, type: 'debt' | 'payment', amount: number, note = '') {
    await db.transaction('rw', ALL(), async () => {
      const id = uuid()
      await db.ledger.add({ id, customerId, date: Date.now(), type, amount, note })
      await queue('ledger', id)
    })
  }

  /** Массовый импорт товаров из таблицы: одна транзакция, остатки — через движения. */
  async function importProductsBulk(toAdd: Product[], toPut: Product[]) {
    await db.transaction('rw', ALL(), async () => {
      const now = Date.now()
      const moves: StockMove[] = []
      const out: OutboxItem[] = []
      const mark = (kind: Kind, id: string) => out.push({ key: `${kind}:${id}`, kind, id, deleted: false, ts: now + Math.random() })

      for (const p of toAdd) {
        p.updatedAt = now
        p.priceChangedAt = now
        if (p.stock !== 0) moves.push({ id: uuid(), productId: p.id, delta: p.stock, date: now, reason: 'initial' })
        mark('product', p.id)
      }
      await db.products.bulkAdd(toAdd)

      const puts: Product[] = []
      for (const p of toPut) {
        const old = await db.products.get(p.id)
        if (!old) continue
        const delta = round3(p.stock - old.stock)
        p.priceChangedAt = old.sellPrice !== p.sellPrice ? now : old.priceChangedAt
        p.updatedAt = now
        if (delta !== 0) moves.push({ id: uuid(), productId: p.id, delta, date: now, reason: 'adjust' })
        puts.push(p)
        mark('product', p.id)
      }
      await db.products.bulkPut(puts)
      await db.moves.bulkAdd(moves)
      moves.forEach((m) => mark('move', m.id))
      await db.outbox.bulkPut(out)
    })
  }

  // ---------- Синхронизация ----------

  const sumMoves = async (productId: string) =>
    round3((await db.moves.where('productId').equals(productId).toArray()).reduce((s, m) => s + m.delta, 0))

  /** Применяет одну запись с сервера (или из файла). Возвращает true, если что-то изменилось. Идемпотентно. */
  async function applyOne(row: RemoteRow): Promise<boolean> {
    const { id, kind, deleted } = row
    switch (kind) {
      case 'product': {
        if (deleted) {
          const had = await db.products.get(id)
          if (had) await db.products.delete(id)
          return !!had
        }
        const incoming = row.data as Product
        const local = await db.products.get(id)
        if (!local) {
          await db.products.put({ ...incoming, id, stock: await sumMoves(id) })
          return true
        }
        if ((incoming.updatedAt ?? 0) > local.updatedAt) {
          await db.products.put({ ...incoming, id, stock: local.stock })
          return true
        }
        return false
      }
      case 'customer': {
        if (deleted) {
          const had = await db.customers.get(id)
          if (had) await db.customers.delete(id)
          return !!had
        }
        const incoming = row.data as Customer
        const local = await db.customers.get(id)
        if (!local || (incoming.updatedAt ?? 0) > local.updatedAt) {
          await db.customers.put({ ...incoming, id })
          return true
        }
        return false
      }
      case 'receipt':
      case 'sale':
      case 'ledger': {
        const t = db.table(KIND_TABLE[kind])
        if (deleted) {
          const had = await t.get(id)
          if (had) await t.delete(id)
          return !!had
        }
        if (await t.get(id)) return false
        await t.put({ ...row.data, id })
        return true
      }
      case 'move': {
        if (deleted) {
          const m = await db.moves.get(id)
          if (!m) return false
          await db.moves.delete(id)
          await bumpStock(m.productId, -m.delta)
          return true
        }
        if (await db.moves.get(id)) return false
        const m = { ...row.data, id } as StockMove
        await db.moves.put(m)
        await bumpStock(m.productId, m.delta)
        return true
      }
    }
  }

  async function applyRows(rows: RemoteRow[], queueChanges: boolean): Promise<void> {
    await db.transaction('rw', ALL(), async () => {
      for (const row of rows) {
        // Локальное удаление ещё не отправлено: сервер пока хранит «живую» копию,
        // её нельзя возвращать обратно. (При загрузке копии из файла возврат — намеренный.)
        if (!queueChanges && !row.deleted) {
          const pending = await db.outbox.get(`${row.kind}:${row.id}`)
          if (pending?.deleted) continue
        }
        const changed = await applyOne(row)
        if (changed && queueChanges) await queue(row.kind, row.id, row.deleted)
      }
    })
  }

  /** Записи из очереди в формате для сервера. */
  async function pendingRows(limit: number): Promise<{ items: OutboxItem[]; rows: RemoteRow[] }> {
    const items = await db.outbox.limit(limit).toArray()
    const rows: RemoteRow[] = []
    for (const it of items) {
      if (it.deleted) {
        rows.push({ id: it.id, kind: it.kind, data: {}, deleted: true })
        continue
      }
      const rec = await db.table(KIND_TABLE[it.kind]).get(it.id)
      if (rec) rows.push({ id: it.id, kind: it.kind, data: rec, deleted: false })
    }
    return { items, rows }
  }

  /** Убирает отправленное из очереди, если запись не менялась во время отправки. */
  async function ackPushed(items: OutboxItem[]) {
    await db.transaction('rw', db.outbox, async () => {
      for (const it of items) {
        const cur = await db.outbox.get(it.key)
        if (cur && cur.ts === it.ts) await db.outbox.delete(it.key)
      }
    })
  }

  const getMeta = async <T>(key: string): Promise<T | undefined> => (await db.meta.get(key))?.value as T | undefined
  const setMeta = (key: string, value: unknown) => db.meta.put({ key, value })

  // ---------- Резервная копия ----------

  async function exportAll(): Promise<string> {
    const records: { kind: Kind; id: string; data: unknown }[] = []
    for (const kind of KIND_ORDER) {
      const all = await db.table(KIND_TABLE[kind]).toArray()
      for (const data of all) records.push({ kind, id: data.id, data })
    }
    return JSON.stringify({ app: 'bereke', version: 3, exportedAt: Date.now(), records })
  }

  /** Загрузка копии: данные ДОБАВЛЯЮТСЯ к текущим (без удаления), поэтому безопасно при синхронизации. */
  async function importAll(json: string): Promise<{ products: number; receipts: number }> {
    const data = JSON.parse(json)
    if (data?.app !== 'bereke') throw new Error('bad file')
    let rows: RemoteRow[]
    if (data.version >= 3 && Array.isArray(data.records)) {
      rows = data.records.map((r: { kind: Kind; id: string; data: unknown }) => ({ kind: r.kind, id: r.id, data: r.data, deleted: false }))
    } else if (Array.isArray(data.products)) {
      rows = convertLegacy(data)
    } else throw new Error('bad file')
    rows.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    await applyRows(rows, true)
    return {
      products: rows.filter((r) => r.kind === 'product').length,
      receipts: rows.filter((r) => r.kind === 'receipt').length,
    }
  }

  return {
    findByBarcode,
    saveProduct,
    deleteProduct,
    markLabelsPrinted,
    commitReceipt,
    completeSale,
    voidSale,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    addLedger,
    importProductsBulk,
    applyRows,
    pendingRows,
    ackPushed,
    getMeta,
    setMeta,
    exportAll,
    importAll,
  }
}

export const db = new BerekeDB()
export const store = createStore(db)
export const {
  findByBarcode,
  saveProduct,
  deleteProduct,
  markLabelsPrinted,
  commitReceipt,
  completeSale,
  voidSale,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  addLedger,
  importProductsBulk,
  exportAll,
  importAll,
} = store

/** Однократный перенос данных из старой базы (числовые id) в новую. Старая остаётся нетронутой. */
export async function migrateLegacy(): Promise<void> {
  try {
    if (localStorage.getItem('migrated_v3')) return
    if (!(await Dexie.exists('bereke'))) {
      localStorage.setItem('migrated_v3', '1')
      return
    }
    const old = new Dexie('bereke')
    await old.open()
    const read = async (name: string) => (old.tables.some((t) => t.name === name) ? old.table(name).toArray() : [])
    const data = {
      products: await read('products'),
      receipts: await read('receipts'),
      customers: await read('customers'),
      sales: await read('sales'),
      ledger: await read('ledger'),
    }
    old.close()
    const rows = convertLegacy(data).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    await store.applyRows(rows, true)
    localStorage.setItem('migrated_v3', '1')
  } catch (e) {
    console.error('migration failed', e)
  }
}
