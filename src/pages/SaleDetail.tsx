import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Printer, Undo2, X } from 'lucide-react'
import { createRefund, db, returnedQty, voidSale } from '../db'
import { fmtDate, money, qtyText, useI18n } from '../i18n'
import QtyInput from '../components/QtyInput'
import { PrintReceipt, printReceiptNow, type PrintData } from '../components/PrintReceipt'

export default function SaleDetail() {
  const { t } = useI18n()
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [refundOpen, setRefundOpen] = useState(false)

  const data = useLiveQuery(async () => {
    const sale = await db.sales.get(id)
    if (!sale) return null
    const refunds = await db.refunds.where('saleId').equals(id).toArray()
    const returned = await returnedQty(id)
    const customer = sale.customerId ? await db.customers.get(sale.customerId) : undefined
    return { sale, refunds, returned, customer }
  }, [id])

  if (data === undefined) return null
  if (data === null) {
    return (
      <div className="page">
        <Link to="/sales" className="back">
          <ArrowLeft className="ico sm" /> {t('backToList')}
        </Link>
        <div className="empty">
          <b>{t('noSales')}</b>
        </div>
      </div>
    )
  }
  const { sale, refunds, returned, customer } = data
  const subtotal = sale.items.reduce((s, i) => s + Math.round(i.qty * i.price), 0)
  const canRefund = sale.items.some((i) => i.qty - (returned.get(i.productId) ?? 0) > 0)

  const print: PrintData = {
    id: sale.id,
    date: sale.date,
    items: sale.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
    subtotal,
    discount: sale.discount ?? 0,
    total: sale.total,
    cash: sale.cash,
    card: sale.card,
    debt: sale.debt,
    customer: customer?.name,
  }

  const cancel = async () => {
    if (!confirm(t('confirmVoid'))) return
    await voidSale(sale.id)
    nav('/sales')
  }

  return (
    <div className="page">
      <Link to="/sales" className="back">
        <ArrowLeft className="ico sm" /> {t('salesTitle')}
      </Link>
      <div className="page-head">
        <div>
          <h1>
            {t('checkWord')} {sale.id.slice(0, 6).toUpperCase()}
          </h1>
          <div className="sub">{fmtDate(sale.date)}</div>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={printReceiptNow}>
            <Printer className="ico" /> {t('printReceipt')}
          </button>
          {canRefund && (
            <button className="btn" onClick={() => setRefundOpen(true)}>
              <Undo2 className="ico" /> {t('doRefund')}
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <b>{t('saleItems')}</b>
        {sale.items.map((i) => {
          const back = returned.get(i.productId) ?? 0
          return (
            <div className="kv" key={i.productId}>
              <span>
                {i.name}
                <span className="muted small">
                  {' '}
                  {qtyText(i.qty)} × {money(i.price)}
                </span>
                {back > 0 && (
                  <span className="badge warn" style={{ marginLeft: 6 }}>
                    {qtyText(back)} {t('alreadyReturned')}
                  </span>
                )}
              </span>
              <b>{money(Math.round(i.qty * i.price))}</b>
            </div>
          )
        })}
      </div>

      <div className="card">
        {(sale.discount ?? 0) > 0 && (
          <>
            <div className="kv">
              <span>{t('subtotal')}</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="kv">
              <span>{t('discountWord')}</span>
              <span>−{money(sale.discount!)}</span>
            </div>
          </>
        )}
        <div className="kv total">
          <span>{t('totalLabel')}</span>
          <span>{money(sale.total)}</span>
        </div>
        {sale.cash > 0 && (
          <div className="kv">
            <span>{t('payCash')}</span>
            <span>{money(sale.cash)}</span>
          </div>
        )}
        {sale.card > 0 && (
          <div className="kv">
            <span>{t('payCard')}</span>
            <span>{money(sale.card)}</span>
          </div>
        )}
        {sale.debt > 0 && (
          <div className="kv">
            <span>
              {t('payDebt')}
              {customer && <span className="muted"> · {customer.name}</span>}
            </span>
            <span className="debt">{money(sale.debt)}</span>
          </div>
        )}
      </div>

      {refunds.length > 0 && (
        <div className="card">
          <b>{t('refundsLabel')}</b>
          {refunds.map((r) => (
            <div className="kv" key={r.id}>
              <span>
                {fmtDate(r.date)}
                <span className="muted small">
                  {' '}
                  · {r.items.map((i) => `${i.name} ×${qtyText(i.qty)}`).join(', ')} ·{' '}
                  {t(r.method === 'cash' ? 'refundCash' : r.method === 'card' ? 'refundCard' : 'refundDebt')}
                </span>
              </span>
              <b>−{money(r.total)}</b>
            </div>
          ))}
        </div>
      )}

      {refunds.length === 0 && (
        <div className="row mt" style={{ alignItems: 'flex-start' }}>
          <button className="btn danger" onClick={cancel}>
            {t('voidSale')}
          </button>
          <p className="muted small grow">{t('voidHint')}</p>
        </div>
      )}

      {refundOpen && <RefundModal saleId={sale.id} hasCustomer={!!sale.customerId} onClose={() => setRefundOpen(false)} />}
      <PrintReceipt data={print} />
    </div>
  )
}

function RefundModal({ saleId, hasCustomer, onClose }: { saleId: string; hasCustomer: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const sale = useLiveQuery(() => db.sales.get(saleId), [saleId])
  const returned = useLiveQuery(() => returnedQty(saleId), [saleId])
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [method, setMethod] = useState<'cash' | 'card' | 'debt'>(hasCustomer ? 'debt' : 'cash')
  const [busy, setBusy] = useState(false)
  if (!sale || !returned) return null

  const subtotal = sale.items.reduce((s, i) => s + Math.round(i.qty * i.price), 0)
  const k = subtotal > 0 ? 1 - (sale.discount ?? 0) / subtotal : 1
  const picked = sale.items.map((i) => ({ item: i, qty: qtys[i.productId] ?? 0 }))
  const total = Math.round(picked.reduce((s, x) => s + Math.round(x.qty * x.item.price), 0) * k)

  const go = async () => {
    setBusy(true)
    await createRefund(
      saleId,
      picked.filter((x) => x.qty > 0).map((x) => ({ productId: x.item.productId, qty: x.qty })),
      method,
    )
    onClose()
  }

  const methods: ['cash' | 'card' | 'debt', string][] = [
    ['cash', t('refundCash')],
    ['card', t('refundCard')],
  ]
  if (hasCustomer) methods.push(['debt', t('refundDebt')])

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('refundTitle')}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label={t('cancel')}>
            <X className="ico" />
          </button>
        </div>
        {sale.items.map((i) => {
          const left = Math.round((i.qty - (returned.get(i.productId) ?? 0)) * 1000) / 1000
          if (left <= 0) return null
          const step = Number.isInteger(i.qty) ? 1 : 0.1
          const cur = qtys[i.productId] ?? 0
          return (
            <div className="card row between" key={i.productId}>
              <div className="grow">
                <div className="li-name">{i.name}</div>
                <div className="muted small">
                  {money(i.price)} · {qtyText(left)} {t('pcs')}
                </div>
              </div>
              {cur > 0 ? (
                <QtyInput value={cur} step={step} onChange={(v) => setQtys({ ...qtys, [i.productId]: Math.min(v, left) })} />
              ) : (
                <button className="btn secondary" onClick={() => setQtys({ ...qtys, [i.productId]: Math.min(step, left) })}>
                  +
                </button>
              )}
              {cur > 0 && (
                <button className="link" onClick={() => setQtys({ ...qtys, [i.productId]: 0 })} aria-label={t('remove')}>
                  <X className="ico sm" />
                </button>
              )}
            </div>
          )
        })}

        <div className="field-label muted small">{t('refundMethod')}</div>
        <div className="chips">
          {methods.map(([m, label]) => (
            <button key={m} className={method === m ? 'chip active' : 'chip'} onClick={() => setMethod(m)}>
              {label}
            </button>
          ))}
        </div>

        <div className="kv total">
          <span>{t('refundTotal')}</span>
          <span>{money(total)}</span>
        </div>
        <button className="btn gold big block" disabled={total <= 0 || busy} onClick={go}>
          {t('refundConfirm')}
        </button>
      </div>
    </div>
  )
}
