import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check, Copy, MessageCircle } from 'lucide-react'
import { db, type Product } from '../db'
import { money, qtyText, useI18n } from '../i18n'
import { num } from './ProductForm'

/** Сколько заказать по умолчанию: до двойного минимума, целыми штуками. */
export function suggestQty(p: Product): number {
  return Math.max(1, Math.ceil(p.minStock * 2 - p.stock))
}

export default function Order() {
  const { t } = useI18n()
  const [qty, setQty] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState('')
  const data = useLiveQuery(async () => {
    const [products, suppliers] = await Promise.all([db.products.toArray(), db.suppliers.toArray()])
    const low = products.filter((p) => p.minStock > 0 && p.stock <= p.minStock).sort((a, b) => a.name.localeCompare(b.name))
    return { low, suppliers }
  }, [])
  if (!data) return null

  const groups = new Map<string, Product[]>()
  for (const p of data.low) {
    const key = data.suppliers.some((s) => s.id === p.supplierId) ? p.supplierId! : ''
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : 0))
  const qtyOf = (p: Product) => (qty[p.id] !== undefined ? num(qty[p.id]) : suggestQty(p))

  const textFor = (items: Product[]) =>
    `${t('orderText')}\n` + items.filter((p) => qtyOf(p) > 0).map((p) => `• ${p.name} — ${qtyText(qtyOf(p))} ${t(p.unit === 'kg' ? 'kg' : 'pcs')}`).join('\n')

  const copy = async (key: string, items: Product[]) => {
    try {
      await navigator.clipboard.writeText(textFor(items))
      setCopied(key)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* буфер недоступен */
    }
  }

  return (
    <div className="page">
      <Link to="/stock" className="back">
        <ArrowLeft className="ico sm" /> {t('stockTitle')}
      </Link>
      <div className="page-head">
        <h1>{t('orderTitle')}</h1>
      </div>

      {data.low.length === 0 ? (
        <div className="empty">
          <Check className="ico" />
          <b>{t('orderEmpty')}</b>
          {t('orderSetMin')}
        </div>
      ) : (
        <p className="muted small" style={{ marginBottom: 6 }}>
          {t('orderHint')}
        </p>
      )}

      {ordered.map(([key, items]) => {
        const sup = data.suppliers.find((s) => s.id === key)
        const approx = items.reduce((s, p) => s + qtyOf(p) * p.buyPrice, 0)
        const phone = sup?.phone.replace(/\D/g, '')
        return (
          <div className="card" key={key || 'none'}>
            <div className="row between">
              <h3 className="card-title" style={{ margin: 0 }}>
                {sup?.name ?? t('orderNoSupplier')}
              </h3>
              <span className="muted small num">
                {t('orderApprox')} {money(approx)}
              </span>
            </div>
            {items.map((p) => (
              <div className="kv" key={p.id} style={{ alignItems: 'center' }}>
                <span>
                  <Link to={`/products/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {p.name}
                  </Link>
                  <span className="muted small">
                    {' '}
                    · {t('stock')} {qtyText(p.stock)} / {qtyText(p.minStock)}
                  </span>
                </span>
                <input
                  inputMode="decimal"
                  aria-label={t('orderQty')}
                  style={{ width: 72, minHeight: 40, textAlign: 'center' }}
                  value={qty[p.id] ?? String(suggestQty(p))}
                  onChange={(e) => setQty({ ...qty, [p.id]: e.target.value })}
                />
              </div>
            ))}
            <div className="row wrap mt">
              <button className="btn secondary" onClick={() => copy(key, items)}>
                {copied === key ? <Check className="ico" /> : <Copy className="ico" />} {copied === key ? t('orderCopied') : t('orderCopy')}
              </button>
              <a
                className="btn"
                target="_blank"
                rel="noreferrer"
                href={`https://wa.me/${phone ?? ''}?text=${encodeURIComponent(textFor(items))}`}
              >
                <MessageCircle className="ico" /> {t('orderWhatsApp')}
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}
