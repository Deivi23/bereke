import Dexie, { type Table } from 'dexie'

export type Unit = 'pcs' | 'kg'

export interface Product {
  id?: number
  /** Один товар может иметь несколько штрихкодов (штучный, коробка и т.д.) */
  barcodes: string[]
  name: string
  category: string
  unit: Unit
  buyPrice: number
  sellPrice: number
  stock: number
  minStock: number
  updatedAt: number
  /** Когда цена менялась в последний раз (для перепечати ценников) */
  priceChangedAt: number
  /** Когда ценник печатали в последний раз */
  labelPrintedAt: number
}

export interface ReceiptItem {
  productId: number
  name: string
  qty: number
  buyPrice: number
}

export interface Receipt {
  id?: number
  date: number
  supplier: string
  items: ReceiptItem[]
  total: number
}

export interface Customer {
  id?: number
  name: string
  phone: string
  createdAt: number
}

export interface SaleItem {
  productId: number
  name: string
  qty: number
  price: number
  /** Закупочная цена на момент продажи — нужна для расчёта прибыли */
  buyPrice: number
}

export interface Sale {
  id?: number
  date: number
  items: SaleItem[]
  total: number
  cash: number
  card: number
  debt: number
  customerId?: number
}

/** Запись в долговой книге: долг клиента или его оплата. */
export interface LedgerEntry {
  id?: number
  customerId: number
  date: number
  type: 'debt' | 'payment'
  amount: number
  saleId?: number
  note: string
}

class BerekeDB extends Dexie {
  products!: Table<Product, number>
  receipts!: Table<Receipt, number>
  customers!: Table<Customer, number>
  sales!: Table<Sale, number>
  ledger!: Table<LedgerEntry, number>

  constructor() {
    super('bereke')
    this.version(1).stores({
      products: '++id, *barcodes, name, category, stock, priceChangedAt',
      receipts: '++id, date',
    })
    this.version(2).stores({
      products: '++id, *barcodes, name, category, stock, priceChangedAt',
      receipts: '++id, date',
      customers: '++id, name',
      sales: '++id, date, customerId',
      ledger: '++id, customerId, date, saleId',
    })
  }
}

export const db = new BerekeDB()

export async function findByBarcode(code: string): Promise<Product | undefined> {
  return db.products.where('barcodes').equals(code.trim()).first()
}

export function newProduct(partial: Partial<Product> = {}): Product {
  const now = Date.now()
  return {
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

/** Сохраняет товар; если цена продажи изменилась — помечает ценник на перепечать. */
export async function saveProduct(p: Product): Promise<number> {
  const now = Date.now()
  p.updatedAt = now
  p.barcodes = [...new Set(p.barcodes.map((b) => b.trim()).filter(Boolean))]
  if (p.id) {
    const old = await db.products.get(p.id)
    if (old && old.sellPrice !== p.sellPrice) p.priceChangedAt = now
    await db.products.put(p)
    return p.id
  }
  p.priceChangedAt = now
  return db.products.add(p)
}

/** Проводит приход товара: увеличивает остатки, обновляет закупочные цены. */
export async function commitReceipt(
  supplier: string,
  lines: { product: Product; qty: number; buyPrice: number; sellPrice: number }[],
): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.products, db.receipts, async () => {
    for (const l of lines) {
      const cur = await db.products.get(l.product.id!)
      if (!cur) continue
      cur.stock = round3(cur.stock + l.qty)
      cur.buyPrice = l.buyPrice
      if (cur.sellPrice !== l.sellPrice) {
        cur.sellPrice = l.sellPrice
        cur.priceChangedAt = now
      }
      cur.updatedAt = now
      await db.products.put(cur)
    }
    await db.receipts.add({
      date: now,
      supplier: supplier.trim(),
      total: lines.reduce((s, l) => s + l.qty * l.buyPrice, 0),
      items: lines.map((l) => ({
        productId: l.product.id!,
        name: l.product.name,
        qty: l.qty,
        buyPrice: l.buyPrice,
      })),
    })
  })
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export interface SaleLine {
  product: Product
  qty: number
  price: number
}

/** Проводит продажу: списывает остатки, при долге записывает его в книгу клиента. */
export async function completeSale(
  lines: SaleLine[],
  pay: { cash: number; card: number; debt: number; customerId?: number },
): Promise<number> {
  const now = Date.now()
  const total = lines.reduce((s, l) => s + Math.round(l.qty * l.price), 0)
  return db.transaction('rw', db.products, db.sales, db.ledger, async () => {
    for (const l of lines) {
      const cur = await db.products.get(l.product.id!)
      if (!cur) continue
      cur.stock = round3(cur.stock - l.qty)
      cur.updatedAt = now
      await db.products.put(cur)
    }
    const names = lines.map((l) => l.product.name)
    const note = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '')
    const saleId = await db.sales.add({
      date: now,
      total,
      cash: pay.cash,
      card: pay.card,
      debt: pay.debt,
      customerId: pay.customerId,
      items: lines.map((l) => ({
        productId: l.product.id!,
        name: l.product.name,
        qty: l.qty,
        price: l.price,
        buyPrice: l.product.buyPrice,
      })),
    })
    if (pay.debt > 0 && pay.customerId) {
      await db.ledger.add({ customerId: pay.customerId, date: now, type: 'debt', amount: pay.debt, saleId, note })
    }
    return saleId
  })
}

/** Отмена продажи: возвращает товар на склад и убирает долг. */
export async function voidSale(saleId: number): Promise<void> {
  await db.transaction('rw', db.products, db.sales, db.ledger, async () => {
    const sale = await db.sales.get(saleId)
    if (!sale) return
    for (const it of sale.items) {
      const cur = await db.products.get(it.productId)
      if (cur) {
        cur.stock = round3(cur.stock + it.qty)
        await db.products.put(cur)
      }
    }
    await db.ledger.where('saleId').equals(saleId).delete()
    await db.sales.delete(saleId)
  })
}

export async function addLedger(customerId: number, type: 'debt' | 'payment', amount: number, note = '') {
  await db.ledger.add({ customerId, date: Date.now(), type, amount, note })
}

export function balanceOf(entries: LedgerEntry[]): number {
  return entries.reduce((s, e) => s + (e.type === 'debt' ? e.amount : -e.amount), 0)
}

/** Резервная копия всей базы. */
export async function exportAll(): Promise<string> {
  const [products, receipts, customers, sales, ledger] = await Promise.all([
    db.products.toArray(),
    db.receipts.toArray(),
    db.customers.toArray(),
    db.sales.toArray(),
    db.ledger.toArray(),
  ])
  return JSON.stringify({ app: 'bereke', version: 2, exportedAt: Date.now(), products, receipts, customers, sales, ledger })
}

export async function importAll(json: string): Promise<{ products: number; receipts: number }> {
  const data = JSON.parse(json)
  if (data?.app !== 'bereke' || !Array.isArray(data.products)) throw new Error('bad file')
  await db.transaction('rw', [db.products, db.receipts, db.customers, db.sales, db.ledger], async () => {
    await Promise.all([db.products.clear(), db.receipts.clear(), db.customers.clear(), db.sales.clear(), db.ledger.clear()])
    await db.products.bulkAdd(data.products)
    await db.receipts.bulkAdd(data.receipts ?? [])
    await db.customers.bulkAdd(data.customers ?? [])
    await db.sales.bulkAdd(data.sales ?? [])
    await db.ledger.bulkAdd(data.ledger ?? [])
  })
  return { products: data.products.length, receipts: (data.receipts ?? []).length }
}
