import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check, Trash2, X } from 'lucide-react'
import { createWriteoff, db, type Product, type WriteoffReason } from '../db'
import { fmtDate, money, qtyText, useI18n } from '../i18n'
import ProductPicker from '../components/ProductPicker'
import QtyInput from '../components/QtyInput'

interface Line {
  product: Product
  qty: number
}

const REASONS: [WriteoffReason, 'reasonExpired' | 'reasonDamaged' | 'reasonOwn' | 'reasonOther'][] = [
  ['expired', 'reasonExpired'],
  ['damaged', 'reasonDamaged'],
  ['own', 'reasonOwn'],
  ['other', 'reasonOther'],
]

export default function Writeoff() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const [lines, setLines] = useState<Line[]>([])
  const [reason, setReason] = useState<WriteoffReason>(params.get('product') ? 'expired' : 'damaged')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)
  const history = useLiveQuery(() => db.writeoffs.orderBy('date').reverse().limit(10).toArray(), [])

  // Переход со страницы сроков: сразу подставляем весь остаток товара
  useEffect(() => {
    const id = params.get('product')
    if (!id) return
    db.products.get(id).then((p) => p && p.stock > 0 && setLines([{ product: p, qty: p.stock }]))
  }, [params])

  const add = (p: Product) => {
    setDone(false)
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product.id === p.id)
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: Math.round((l.qty + 1) * 1000) / 1000 } : l))
      return [...ls, { product: p, qty: 1 }]
    })
  }

  const loss = lines.reduce((s, l) => s + l.qty * l.product.buyPrice, 0)

  const submit = async () => {
    if (!lines.length) return
    await createWriteoff(lines, reason, note)
    setLines([])
    setNote('')
    setDone(true)
  }

  return (
    <div className="page">
      <Link to="/stock" className="back">
        <ArrowLeft className="ico sm" /> {t('stockTitle')}
      </Link>
      <div className="page-head">
        <h1>{t('writeoffTitle')}</h1>
      </div>

      <ProductPicker onPick={add} />
      {done && (
        <div className="notice ok">
          <Check className="ico" /> {t('writeoffDone')}
        </div>
      )}

      {lines.length === 0 && !done && <p className="muted center mt">{t('writeoffEmpty')}</p>}

      {lines.map((l, i) => (
        <div className="card" key={l.product.id}>
          <div className="row between">
            <b>{l.product.name}</b>
            <button className="link" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={t('remove')}>
              <X className="ico sm" />
            </button>
          </div>
          <div className="row between mt">
            <QtyInput
              value={l.qty}
              step={l.product.unit === 'kg' ? 0.1 : 1}
              onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: v } : x)))}
            />
            <span className="muted small">
              {t('stock')}: {qtyText(l.product.stock)} · {money(l.qty * l.product.buyPrice)}
            </span>
          </div>
        </div>
      ))}

      {lines.length > 0 && (
        <div className="card">
          <div className="field-label muted small">{t('writeoffReason')}</div>
          <div className="chips">
            {REASONS.map(([r, key]) => (
              <button key={r} className={reason === r ? 'chip active' : 'chip'} onClick={() => setReason(r)}>
                {t(key)}
              </button>
            ))}
          </div>
          <label>
            {t('note')}
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="kv total">
            <span>{t('writeoffLoss')}</span>
            <span className="debt num">{money(loss)}</span>
          </div>
          <button className="btn danger big block" onClick={submit}>
            <Trash2 className="ico" /> {t('writeoffDo')}
          </button>
        </div>
      )}

      {history && history.length > 0 && (
        <>
          <h2>{t('writeoffHistory')}</h2>
          <ul className="list">
            {history.map((w) => (
              <li key={w.id} className="list-item static" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="li-name">
                    {w.items
                      .slice(0, 2)
                      .map((i) => `${i.name} ×${qtyText(i.qty)}`)
                      .join(', ')}
                    {w.items.length > 2 && ` +${w.items.length - 2}`}
                  </div>
                  <div className="li-sub">
                    {fmtDate(w.date)} · {t(REASONS.find((r) => r[0] === w.reason)![1])}
                    {w.note && ` · ${w.note}`}
                  </div>
                </div>
                <span className="li-price debt">{money(w.total)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
