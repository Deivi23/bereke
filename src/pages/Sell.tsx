import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { completeSale, db, findByBarcode, voidSale, type Customer, type Product } from '../db'
import { cart, useCartLines } from '../cart'
import { beep } from '../feedback'
import { fmtDate, money, qtyText, useI18n } from '../i18n'
import Scanner from '../components/Scanner'
import CodeInput from '../components/CodeInput'
import QtyInput from '../components/QtyInput'
import CustomerPicker from '../components/CustomerPicker'
import SyncBadge from '../components/SyncBadge'
import { num } from './ProductForm'

type Flash = { ok: boolean; text: string; code?: string } | null

const startOfDay = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export default function Sell() {
  const { t } = useI18n()
  const lines = useCartLines()
  const [camera, setCamera] = useState(false)
  const [flash, setFlash] = useState<Flash>(null)
  const [q, setQ] = useState('')
  const [debtOpen, setDebtOpen] = useState(false)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [paidNow, setPaidNow] = useState('')
  const [done, setDone] = useState('')

  const ids = lines.map((l) => l.productId)
  const products = useLiveQuery(() => db.products.bulkGet(ids), [ids.join(',')])
  const byId = useMemo(() => {
    const m = new Map<string, Product>()
    products?.forEach((p) => p && m.set(p.id, p))
    return m
  }, [products])

  const rows = lines
    .map((l) => ({ line: l, product: byId.get(l.productId) }))
    .filter((r): r is { line: typeof r.line; product: Product } => !!r.product)
  const sum = (r: (typeof rows)[number]) => Math.round(r.line.qty * r.product.sellPrice)
  const total = rows.reduce((s, r) => s + sum(r), 0)

  const matches = useLiveQuery(async () => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    return db.products.filter((p) => p.name.toLowerCase().includes(needle)).limit(8).toArray()
  }, [q])

  const today = useLiveQuery(() => db.sales.where('date').aboveOrEqual(startOfDay()).reverse().toArray(), [])
  const todayTotal = (today ?? []).reduce((s, x) => s + x.total, 0)

  const onCode = async (code: string, sound: boolean) => {
    setDone('')
    const p = await findByBarcode(code)
    if (p) {
      cart.add(p.id, 1)
      if (sound) beep(true)
      setFlash({ ok: true, text: `${p.name} — ${money(p.sellPrice)}` })
    } else {
      beep(false)
      setFlash({ ok: false, text: t('notFound'), code })
    }
  }

  const finish = async (pay: { cash: number; card: number; debt: number; customerId?: string }) => {
    await completeSale(
      rows.map((r) => ({ product: r.product, qty: r.line.qty, price: r.product.sellPrice })),
      pay,
    )
    cart.clear()
    setDebtOpen(false)
    setCustomer(null)
    setPaidNow('')
    setFlash(null)
    setDone(`${t('saleDone')}: ${money(total)}`)
  }

  const paid = Math.min(Math.max(num(paidNow), 0), total)
  const debtPart = total - paid

  const cancelSale = async (id: string) => {
    if (confirm(t('confirmVoid'))) await voidSale(id)
  }

  return (
    <div className="page">
      <div className="row between">
        <h1>{t('sellTitle')}</h1>
        {(today?.length ?? 0) > 0 && (
          <span className="muted small">
            {t('today')}: {today!.length} {t('salesWord')} · <b>{money(todayTotal)}</b>
          </span>
        )}
      </div>

      <SyncBadge />

      {camera ? (
        <>
          <Scanner onDetect={(c) => onCode(c, false)} cooldownMs={1500} />
          <button className="btn secondary block" onClick={() => setCamera(false)}>
            {t('stopCamera')}
          </button>
        </>
      ) : (
        <button className="btn big block" onClick={() => setCamera(true)}>
          📷 {t('startCamera')}
        </button>
      )}
      <div className="gap" />
      <CodeInput onSubmit={(c) => onCode(c, true)} autoFocus={!camera} />

      <input
        type="search"
        className="mt"
        value={q}
        placeholder={t('addByName')}
        onChange={(e) => setQ(e.target.value)}
      />
      {(matches?.length ?? 0) > 0 && (
        <ul className="list">
          {matches!.map((p) => (
            <li key={p.id}>
              <button
                className="list-item"
                onClick={() => {
                  cart.add(p.id, 1)
                  setQ('')
                  setDone('')
                }}
              >
                <span className="li-name">{p.name}</span>
                <span className="li-price">{money(p.sellPrice)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {flash && (
        <div className={flash.ok ? 'notice ok' : 'notice error'}>
          {flash.ok ? '✓ ' : '✗ '}
          {flash.text}
          {flash.code && (
            <>
              {' '}
              ({flash.code}) <Link to={`/products/new?barcode=${encodeURIComponent(flash.code)}`}>+ {t('addProduct')}</Link>
            </>
          )}
        </div>
      )}
      {done && <div className="notice ok">✓ {done}</div>}

      {rows.length === 0 && !done && <p className="muted center">{t('cartEmpty')}</p>}

      {rows.map(({ line, product: p }) => (
        <div className="card line" key={p.id}>
          <div className="row between">
            <b>{p.name}</b>
            <button className="link" onClick={() => cart.remove(p.id)}>
              ✕
            </button>
          </div>
          <div className="row between">
            <QtyInput value={line.qty} step={p.unit === 'kg' ? 0.1 : 1} onChange={(v) => cart.setQty(p.id, v)} />
            <div className="line-sum">
              <div className="li-price">{money(Math.round(line.qty * p.sellPrice))}</div>
              <div className="muted small">
                {money(p.sellPrice)} / {t(p.unit === 'kg' ? 'kg' : 'pcs')}
              </div>
            </div>
          </div>
          {line.qty > p.stock && (
            <div className="muted small warn">
              ⚠ {t('lowStockWarn')}: {qtyText(p.stock)}
            </div>
          )}
        </div>
      ))}

      {rows.length > 0 && (
        <div className="sticky-total">
          <div className="row between">
            <span className="muted">{t('totalLabel')}</span>
            <span className="grand">{money(total)}</span>
          </div>
          <div className="pay-buttons">
            <button className="btn big" onClick={() => finish({ cash: total, card: 0, debt: 0 })}>
              💵 {t('cash')}
            </button>
            <button className="btn big" onClick={() => finish({ cash: 0, card: total, debt: 0 })}>
              💳 {t('card')}
            </button>
            <button className="btn big debt-btn" onClick={() => setDebtOpen(true)}>
              📒 {t('onDebt')}
            </button>
          </div>
          <button className="link small" onClick={() => cart.clear()}>
            {t('clearCart')}
          </button>
        </div>
      )}

      {debtOpen && (
        <div className="modal" onClick={() => setDebtOpen(false)}>
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <h2>{t('chooseCustomer')}</h2>
            {!customer ? (
              <CustomerPicker onSelect={setCustomer} />
            ) : (
              <>
                <div className="card">
                  <div className="li-name">{customer.name}</div>
                  {customer.phone && <div className="muted small">{customer.phone}</div>}
                  <button className="link small" onClick={() => setCustomer(null)}>
                    ← {t('chooseCustomer')}
                  </button>
                </div>
                <div className="row between">
                  <span className="muted">{t('totalLabel')}</span>
                  <b>{money(total)}</b>
                </div>
                <label>
                  {t('paidNow')}, ₸
                  <input inputMode="decimal" value={paidNow} placeholder="0" onChange={(e) => setPaidNow(e.target.value)} />
                </label>
                <div className="row between">
                  <span>{t('debtAmount')}</span>
                  <b className="debt">{money(debtPart)}</b>
                </div>
                <div className="row mt">
                  <button
                    className="btn big grow"
                    disabled={debtPart <= 0}
                    onClick={() => finish({ cash: paid, card: 0, debt: debtPart, customerId: customer.id })}
                  >
                    {t('confirmDebt')}
                  </button>
                  <button className="btn secondary" onClick={() => setDebtOpen(false)}>
                    {t('cancel')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {(today?.length ?? 0) > 0 && (
        <>
          <h2>{t('todaySales')}</h2>
          <ul className="list">
            {today!.slice(0, 20).map((s) => (
              <li key={s.id} className="list-item static">
                <div>
                  <div className="li-name">{money(s.total)}</div>
                  <div className="muted small">
                    {fmtDate(s.date)} · {s.items.length}
                    {s.cash > 0 && ` · ${t('cashShort')}`}
                    {s.card > 0 && ` · ${t('cardShort')}`}
                    {s.debt > 0 && ` · ${t('debtShort')} ${money(s.debt)}`}
                  </div>
                </div>
                <button className="link small" onClick={() => cancelSale(s.id)}>
                  {t('voidSale')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
