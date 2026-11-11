import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { commitReceipt, db, findByBarcode, newProduct, saveProduct, type Product, type Unit } from '../db'
import { money, useI18n } from '../i18n'
import { beep } from '../feedback'
import Scanner from '../components/Scanner'
import CodeInput from '../components/CodeInput'
import { num } from './ProductForm'
import { Camera, Check, X } from 'lucide-react'

interface Line {
  product: Product
  qty: string
  buy: string
  sell: string
}

interface Draft {
  code: string
  name: string
  buy: string
  sell: string
  unit: Unit
}

export default function Receive() {
  const { t } = useI18n()
  const [supplier, setSupplier] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [camera, setCamera] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [done, setDone] = useState(false)
  const history = useLiveQuery(() => db.receipts.orderBy('date').reverse().limit(10).toArray(), [])

  const addProduct = (product: Product) => {
    setDone(false)
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product.id === product.id)
      if (i >= 0) {
        const copy = [...ls]
        copy[i] = { ...copy[i], qty: String(num(copy[i].qty) + 1) }
        return copy
      }
      return [
        ...ls,
        {
          product,
          qty: '1',
          buy: product.buyPrice ? String(product.buyPrice) : '',
          sell: product.sellPrice ? String(product.sellPrice) : '',
        },
      ]
    })
  }

  const onCode = async (code: string) => {
    const p = await findByBarcode(code)
    if (p) return addProduct(p)
    beep(false)
    setDraft({ code, name: '', buy: '', sell: '', unit: 'pcs' })
  }

  const saveDraft = async () => {
    if (!draft || !draft.name.trim()) return
    const p = newProduct({
      barcodes: [draft.code],
      name: draft.name.trim(),
      unit: draft.unit,
      buyPrice: num(draft.buy),
      sellPrice: num(draft.sell),
    })
    p.id = await saveProduct(p)
    setDraft(null)
    addProduct(p)
  }

  const update = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const total = lines.reduce((s, l) => s + num(l.qty) * num(l.buy), 0)

  const commit = async () => {
    const valid = lines.filter((l) => num(l.qty) > 0)
    if (!valid.length) return
    await commitReceipt(
      supplier,
      valid.map((l) => ({
        product: l.product,
        qty: num(l.qty),
        buyPrice: num(l.buy),
        sellPrice: num(l.sell),
      })),
    )
    setLines([])
    setSupplier('')
    setDone(true)
  }

  return (
    <div className="page">
      <h1>{t('receiveTitle')}</h1>

      <label>
        {t('supplier')}
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
      </label>

      {camera ? (
        <>
          <Scanner onDetect={onCode} />
          <button className="btn secondary block" onClick={() => setCamera(false)}>
            {t('stopCamera')}
          </button>
        </>
      ) : (
        <button className="btn big block" onClick={() => setCamera(true)}>
          <Camera className="ico" /> {t('startCamera')}
        </button>
      )}
      <div className="gap" />
      <CodeInput onSubmit={onCode} />

      {draft && (
        <div className="card">
          <b>{t('quickAdd')}</b>
          <p className="muted small">
            {t('unknownCode')}: {draft.code}
          </p>
          <label>
            {t('name')}
            <input value={draft.name} autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <div className="grid2">
            <label>
              {t('buyPrice')}
              <input inputMode="decimal" value={draft.buy} onChange={(e) => setDraft({ ...draft, buy: e.target.value })} />
            </label>
            <label>
              {t('sellPrice')}
              <input inputMode="decimal" value={draft.sell} onChange={(e) => setDraft({ ...draft, sell: e.target.value })} />
            </label>
          </div>
          <label>
            {t('unit')}
            <select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value as Unit })}>
              <option value="pcs">{t('unitPcs')}</option>
              <option value="kg">{t('unitKg')}</option>
            </select>
          </label>
          <div className="row">
            <button className="btn grow" onClick={saveDraft}>
              {t('save')}
            </button>
            <button className="btn secondary" onClick={() => setDraft(null)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {done && <div className="notice ok"><Check className="ico" /> {t('receiptDone')}</div>}

      {lines.length === 0 && !done && <p className="muted center">{t('emptyReceipt')}</p>}

      {lines.map((l, i) => {
        const b = num(l.buy)
        const s = num(l.sell)
        const markup = b > 0 && s > 0 ? Math.round(((s - b) / b) * 100) : null
        return (
          <div className="card line" key={l.product.id}>
            <div className="row between">
              <b>{l.product.name}</b>
              <button className="link" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <X className="ico sm" />
              </button>
            </div>
            <div className="grid3">
              <label>
                {t('qty')} ({t(l.product.unit === 'kg' ? 'kg' : 'pcs')})
                <input inputMode="decimal" value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} />
              </label>
              <label>
                {t('buyPriceLabel')}
                <input inputMode="decimal" value={l.buy} onChange={(e) => update(i, { buy: e.target.value })} />
              </label>
              <label>
                {t('newSell')}
                <input inputMode="decimal" value={l.sell} onChange={(e) => update(i, { sell: e.target.value })} />
              </label>
            </div>
            {markup !== null && (
              <div className="muted small">
                {t('margin')}: {markup}%
                {l.product.sellPrice !== s && l.product.sellPrice > 0 && ` · было ${money(l.product.sellPrice)}`}
              </div>
            )}
          </div>
        )
      })}

      {lines.length > 0 && (
        <div className="sticky-total">
          <div>
            {t('lines')}: <b>{lines.length}</b> · {t('sum')}: <b>{money(total)}</b>
          </div>
          <button className="btn big" onClick={commit}>
            {t('commit')}
          </button>
        </div>
      )}

      {history && history.length > 0 && (
        <>
          <h2>{t('history')}</h2>
          <ul className="list">
            {history.map((r) => (
              <li key={r.id} className="list-item static">
                <div>
                  <div className="li-name">{r.supplier || '—'}</div>
                  <div className="muted small">
                    {new Date(r.date).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })} · {r.items.length}{' '}
                    {t('lines').toLowerCase()}
                  </div>
                </div>
                <div className="li-price">{money(r.total)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
