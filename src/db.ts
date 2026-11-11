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

class BerekeDB extends Dexie {
  products!: Table<Product, number>
  receipts!: Table<Receipt, number>

  constructor() {
    super('bereke')
    this.version(1).stores({
      products: '++id, *barcodes, name, category, stock, priceChangedAt',
      receipts: '++id, date',
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

/** Резервная копия всей базы. */
export async function exportAll(): Promise<string> {
  const [products, receipts] = await Promise.all([db.products.toArray(), db.receipts.toArray()])
  return JSON.stringify({ app: 'bereke', version: 1, exportedAt: Date.now(), products, receipts })
}

export async function importAll(json: string): Promise<{ products: number; receipts: number }> {
  const data = JSON.parse(json)
  if (data?.app !== 'bereke' || !Array.isArray(data.products)) throw new Error('bad file')
  await db.transaction('rw', db.products, db.receipts, async () => {
    await db.products.clear()
    await db.receipts.clear()
    await db.products.bulkAdd(data.products)
    await db.receipts.bulkAdd(data.receipts ?? [])
  })
  return { products: data.products.length, receipts: (data.receipts ?? []).length }
}
