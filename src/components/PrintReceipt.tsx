import { createPortal } from 'react-dom'
import { fmtDate, money, qtyText, useI18n } from '../i18n'
import { useShop } from '../settings'

export interface PrintData {
  id: string
  date: number
  items: { name: string; qty: number; price: number }[]
  subtotal: number
  discount: number
  total: number
  cash: number
  card: number
  debt: number
  customer?: string
}

/** Чек для печати. Рисуется в #print-root и виден только при печати. */
export function PrintReceipt({ data }: { data: PrintData | null }) {
  const { t } = useI18n()
  const shop = useShop()
  const root = document.getElementById('print-root')
  if (!root || !data) return null
  return createPortal(
    <div className="print-receipt">
      <h3>{shop.name}</h3>
      <div className="c">
        {fmtDate(data.date)} · {t('checkWord')} {data.id.slice(0, 6).toUpperCase()}
      </div>
      <hr />
      {data.items.map((it, i) => (
        <div className="pr-item" key={i}>
          <div>{it.name}</div>
          <div className="pr-row">
            <span>
              {qtyText(it.qty)} × {money(it.price)}
            </span>
            <span>{money(Math.round(it.qty * it.price))}</span>
          </div>
        </div>
      ))}
      <hr />
      {data.discount > 0 && (
        <>
          <div className="pr-row">
            <span>{t('subtotal')}</span>
            <span>{money(data.subtotal)}</span>
          </div>
          <div className="pr-row">
            <span>{t('discountWord')}</span>
            <span>−{money(data.discount)}</span>
          </div>
        </>
      )}
      <div className="pr-row pr-total">
        <span>{t('totalLabel')}</span>
        <span>{money(data.total)}</span>
      </div>
      {data.cash > 0 && (
        <div className="pr-row">
          <span>{t('payCash')}</span>
          <span>{money(data.cash)}</span>
        </div>
      )}
      {data.card > 0 && (
        <div className="pr-row">
          <span>{t('payCard')}</span>
          <span>{money(data.card)}</span>
        </div>
      )}
      {data.debt > 0 && (
        <div className="pr-row">
          <span>{t('payDebt')}</span>
          <span>{money(data.debt)}</span>
        </div>
      )}
      {data.customer && (
        <div className="pr-row">
          <span>{t('customerLabel')}</span>
          <span>{data.customer}</span>
        </div>
      )}
      <hr />
      <div className="c">{shop.footer || t('thanks')}</div>
    </div>,
    root,
  )
}

/** Открывает печать, показывая только чек. */
export function printReceiptNow() {
  document.body.dataset.print = 'receipt'
  const clear = () => {
    delete document.body.dataset.print
    window.removeEventListener('afterprint', clear)
  }
  window.addEventListener('afterprint', clear)
  setTimeout(() => window.print(), 60)
}
