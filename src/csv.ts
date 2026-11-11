import { db, importProductsBulk, newProduct, type Product } from './db'

/** Разбор CSV с кавычками. Разделитель определяется по первой строке. */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = [';', '\t', ','].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  )
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"', i++)
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) (row.push(cell), (cell = ''))
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

/** Excel на русском часто сохраняет CSV в windows-1251 — пробуем обе кодировки. */
export function decodeBytes(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1251').decode(buf)
  }
}

const COLS: Record<string, string[]> = {
  barcode: ['штрихкод', 'штрих-код', 'код', 'barcode', 'ean', 'артикул'],
  name: ['название', 'наименование', 'товар', 'name', 'атауы'],
  sell: ['цена', 'цена продажи', 'розница', 'price', 'sell', 'баға'],
  buy: ['закупка', 'закупочная', 'закупочная цена', 'себестоимость', 'buy', 'cost'],
  stock: ['остаток', 'количество', 'кол-во', 'stock', 'qty', 'қалдық'],
  category: ['категория', 'группа', 'category', 'санат'],
  unit: ['единица', 'ед', 'ед.', 'ед. изм.', 'unit'],
}

const toNum = (s: string | undefined) => {
  const v = parseFloat((s ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}

export async function importProductsCsv(text: string): Promise<{ added: number; updated: number; skipped: number }> {
  const rows = parseCsv(text)
  if (rows.length < 2) return { added: 0, updated: 0, skipped: 0 }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const idx: Partial<Record<keyof typeof COLS, number>> = {}
  for (const key of Object.keys(COLS)) {
    const i = header.findIndex((h) => COLS[key].includes(h))
    if (i >= 0) idx[key] = i
  }
  if (idx.name === undefined) return { added: 0, updated: 0, skipped: rows.length - 1 }

  const existing = await db.products.toArray()
  const byCode = new Map<string, Product>()
  existing.forEach((p) => p.barcodes.forEach((b) => byCode.set(b, p)))

  const toAdd: Product[] = []
  const toPut: Product[] = []
  let skipped = 0
  const now = Date.now()
  const get = (r: string[], k: string) => (idx[k] === undefined ? undefined : r[idx[k]!]?.trim())

  for (const r of rows.slice(1)) {
    const name = get(r, 'name')
    if (!name) {
      skipped++
      continue
    }
    const code = get(r, 'barcode') ?? ''
    const unitRaw = (get(r, 'unit') ?? '').toLowerCase()
    const unit = ['кг', 'kg', 'вес'].includes(unitRaw) ? 'kg' : 'pcs'
    const found = code ? byCode.get(code) : undefined
    if (found) {
      const sell = idx.sell !== undefined ? toNum(get(r, 'sell')) : found.sellPrice
      if (sell !== found.sellPrice) found.priceChangedAt = now
      found.name = name
      found.sellPrice = sell
      if (idx.buy !== undefined) found.buyPrice = toNum(get(r, 'buy'))
      if (idx.stock !== undefined) found.stock = toNum(get(r, 'stock'))
      if (idx.category !== undefined) found.category = get(r, 'category') ?? ''
      found.updatedAt = now
      toPut.push(found)
    } else {
      const p = newProduct({
        barcodes: code ? [code] : [],
        name,
        category: get(r, 'category') ?? '',
        unit,
        buyPrice: toNum(get(r, 'buy')),
        sellPrice: toNum(get(r, 'sell')),
        stock: toNum(get(r, 'stock')),
      })
      if (code) byCode.set(code, p)
      toAdd.push(p)
    }
  }
  await importProductsBulk(toAdd, toPut)
  return { added: toAdd.length, updated: toPut.length, skipped }
}

export async function exportProductsCsv(): Promise<string> {
  const products = await db.products.orderBy('name').toArray()
  const esc = (v: string | number) => {
    const s = String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [['штрихкод', 'название', 'цена', 'закупка', 'остаток', 'категория', 'единица'].join(';')]
  for (const p of products) {
    lines.push(
      [p.barcodes[0] ?? '', p.name, p.sellPrice, p.buyPrice, p.stock, p.category, p.unit === 'kg' ? 'кг' : 'шт']
        .map(esc)
        .join(';'),
    )
  }
  return '﻿' + lines.join('\r\n')
}
