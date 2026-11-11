import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, markLabelsPrinted, type Product } from '../db'
import { money, useI18n } from '../i18n'
import BarcodeSvg from '../components/BarcodeSvg'
import { Printer, Check, X } from 'lucide-react'

interface Item {
  product: Product
  copies: number
}

export default function Labels() {
  const { t } = useI18n()
  const [items, setItems] = useState<Item[]>([])
  const [q, setQ] = useState('')
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [])

  const needed = useMemo(
    () => (products ?? []).filter((p) => p.sellPrice > 0 && p.priceChangedAt > p.labelPrintedAt),
    [products],
  )

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle || !products) return []
    return products
      .filter((p) => p.name.toLowerCase().includes(needle) || p.barcodes.some((b) => b.includes(needle)))
      .slice(0, 8)
  }, [q, products])

  const add = (p: Product) => {
    setItems((its) => (its.some((i) => i.product.id === p.id) ? its : [...its, { product: p, copies: 1 }]))
    setQ('')
  }

  const addAllNeeded = () => {
    setItems((its) => {
      const have = new Set(its.map((i) => i.product.id))
      return [...its, ...needed.filter((p) => !have.has(p.id)).map((p) => ({ product: p, copies: 1 }))]
    })
  }

  const markPrinted = async () => {
    await markLabelsPrinted(items.map((i) => i.product.id))
    setItems([])
  }

  const labels = items.flatMap((i) => Array.from({ length: i.copies }, () => i.product))
  const pages = Math.ceil(labels.length / 24)

  return (
    <div className="page">
      <div className="no-print">
        <h1>{t('labelsTitle')}</h1>

        {needed.length > 0 && (
          <div className="card">
            <div className="row between">
              <span>
                {t('needReprint')}: <b>{needed.length}</b>
              </span>
              <button className="btn" onClick={addAllNeeded}>
                {t('addAllNeeded')}
              </button>
            </div>
          </div>
        )}

        <input type="search" value={q} placeholder={t('addToPrint')} onChange={(e) => setQ(e.target.value)} />
        {matches.length > 0 && (
          <ul className="list">
            {matches.map((p) => (
              <li key={p.id}>
                <button className="list-item" onClick={() => add(p)}>
                  <span className="li-name">{p.name}</span>
                  <span className="li-price">{money(p.sellPrice)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.length === 0 && <p className="muted center">{t('nothingToPrint')}</p>}

        {items.map((i, idx) => (
          <div className="card row between" key={i.product.id}>
            <div>
              <div className="li-name">{i.product.name}</div>
              <div className="muted small">{money(i.product.sellPrice)}</div>
            </div>
            <div className="row">
              <label className="inline">
                {t('copies')}
                <input
                  type="number"
                  min={1}
                  value={i.copies}
                  onChange={(e) =>
                    setItems(items.map((x, j) => (j === idx ? { ...x, copies: Math.max(1, Number(e.target.value) || 1) } : x)))
                  }
                />
              </label>
              <button className="link" onClick={() => setItems(items.filter((_, j) => j !== idx))}>
                <X className="ico sm" />
              </button>
            </div>
          </div>
        ))}

        {items.length > 0 && (
          <>
            <p className="muted small">
              {t('labelsPerPage')} ({labels.length} / {pages})
            </p>
            <div className="row">
              <button className="btn big grow" onClick={() => window.print()}>
                <Printer className="ico" /> {t('print')}
              </button>
              <button className="btn secondary" onClick={() => setItems([])}>
                {t('clearList')}
              </button>
            </div>
            <button className="btn secondary block" onClick={markPrinted}>
              <Check className="ico" /> {t('markPrinted')}
            </button>
          </>
        )}
      </div>

      {labels.length > 0 && (
        <div className="sheet-wrap">
          <div className="sheet print-area">
            {labels.map((p, i) => (
              <div className="label" key={i}>
                <div className="label-name">{p.name}</div>
                <div className="label-price">
                  {money(p.sellPrice)}
                  {p.unit === 'kg' && <small> {t('perKg')}</small>}
                </div>
                {p.barcodes[0] && <BarcodeSvg value={p.barcodes[0]} height={26} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
