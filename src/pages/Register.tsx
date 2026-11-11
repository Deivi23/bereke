import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BookOpen,
  Banknote,
  Camera,
  Check,
  CreditCard,
  Layers,
  Pause,
  Percent,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import { completeSale, db, findByBarcode, type Customer, type Product } from '../db'
import { cart, discountAmount, useCart, type Discount } from '../cart'
import { beep } from '../feedback'
import { money, qtyText, useI18n } from '../i18n'
import Scanner from '../components/Scanner'
import QtyInput from '../components/QtyInput'
import CustomerPicker from '../components/CustomerPicker'
import { PrintReceipt, printReceiptNow, type PrintData } from '../components/PrintReceipt'
import { num } from './ProductForm'

const hue = (s: string) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

interface Row {
  product: Product
  qty: number
  sum: number
}

type Pay = 'cash' | 'card' | 'split' | 'debt'

interface Done {
  total: number
  change: number
  print: PrintData
}

export default function Register() {
  const { t } = useI18n()
  const { lines, discount, parked } = useCart()
  const [camera, setCamera] = useState(false)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [sheet, setSheet] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null)
  const [missing, setMissing] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef(0)

  const say = (text: string, err = false) => {
    window.clearTimeout(toastTimer.current)
    setToast({ text, err })
    toastTimer.current = window.setTimeout(() => setToast(null), 1800)
  }

  // ----- данные -----
  const ids = lines.map((l) => l.productId)
  const cartProducts = useLiveQuery(() => db.products.bulkGet(ids), [ids.join(',')])
  const rows: Row[] = useMemo(() => {
    const m = new Map<string, Product>()
    cartProducts?.forEach((p) => p && m.set(p.id, p))
    return lines
      .map((l) => ({ l, p: m.get(l.productId) }))
      .filter((r): r is { l: typeof r.l; p: Product } => !!r.p)
      .map(({ l, p }) => ({ product: p, qty: l.qty, sum: Math.round(l.qty * p.sellPrice) }))
  }, [lines, cartProducts])
  const subtotal = rows.reduce((s, r) => s + r.sum, 0)
  const disc = discountAmount(subtotal, discount)
  const total = subtotal - disc

  const categories = useLiveQuery(
    async () => ((await db.products.orderBy('category').uniqueKeys()) as string[]).filter(Boolean),
    [],
  )
  const popular = useLiveQuery(async () => {
    const since = Date.now() - 30 * 864e5
    const m = new Map<string, number>()
    await db.sales.where('date').aboveOrEqual(since).each((s) => s.items.forEach((i) => m.set(i.productId, (m.get(i.productId) ?? 0) + 1)))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 36).map((x) => x[0])
  }, [])
  const tilesQ = useLiveQuery(async () => {
      const needle = q.trim().toLowerCase()
      if (needle.length >= 2 && !/^\d+$/.test(needle)) {
        return db.products.filter((p) => p.name.toLowerCase().includes(needle)).limit(60).toArray()
      }
      if (cat) return (await db.products.where('category').equals(cat).limit(200).toArray()).sort((a, b) => a.name.localeCompare(b.name))
      const quick = await db.products.filter((p) => !!p.quick).toArray()
      const rest = (popular ?? []).filter((id) => !quick.some((x) => x.id === id))
      const extra = ((await db.products.bulkGet(rest)).filter(Boolean) as Product[])
      return [...quick, ...extra].slice(0, 36)
    }, [q, cat, popular])
  const tiles = tilesQ ?? []
  const productCount = useLiveQuery(() => db.products.count(), [])
  const shift = useLiveQuery(() => db.shifts.filter((s) => !s.closedAt).first(), [])

  // ----- действия -----
  const add = (p: Product) => {
    cart.add(p.id, 1)
    setMissing('')
  }

  const onCode = async (code: string, sound: boolean) => {
    const p = await findByBarcode(code)
    if (p) {
      add(p)
      if (sound) beep(true)
      say(`${t('added')}: ${p.name}`)
    } else {
      beep(false)
      setMissing(code)
      say(`${t('notFound')}: ${code}`, true)
    }
  }

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = q.trim()
    if (!v) return
    if (/^\d{4,}$/.test(v)) {
      onCode(v, true)
      setQ('')
    } else if (tiles.length >= 1) {
      add(tiles[0])
      say(`${t('added')}: ${tiles[0].name}`)
      setQ('')
    } else {
      say(t('nothingFound'), true)
    }
    searchRef.current?.focus()
  }

  // Горячие клавиши: F2 — поиск, F4 — оплата, Esc — закрыть окно
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (e.key === 'F4') {
        e.preventDefault()
        if (rows.length && !done) setPayOpen(true)
      } else if (e.key === 'Escape') {
        if (payOpen) setPayOpen(false)
        else if (sheet) setSheet(false)
        else if (done) newSale()
        else setQ('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) searchRef.current?.focus()
  }, [])

  const newSale = () => {
    setDone(null)
    setPayOpen(false)
    setSheet(false)
    searchRef.current?.focus()
  }

  const finish = async (pay: { cash: number; card: number; debt: number; customer?: Customer }, change: number) => {
    const id = await completeSale(
      rows.map((r) => ({ product: r.product, qty: r.qty, price: r.product.sellPrice })),
      { cash: pay.cash, card: pay.card, debt: pay.debt, customerId: pay.customer?.id, discount: disc },
    )
    const print: PrintData = {
      id,
      date: Date.now(),
      items: rows.map((r) => ({ name: r.product.name, qty: r.qty, price: r.product.sellPrice })),
      subtotal,
      discount: disc,
      total,
      cash: pay.cash,
      card: pay.card,
      debt: pay.debt,
      customer: pay.customer?.name,
    }
    cart.clear()
    setPayOpen(false)
    setSheet(false)
    setDone({ total, change, print })
  }

  const count = rows.length
  const inCart = (id: string) => lines.find((l) => l.productId === id)?.qty ?? 0

  const panel = (
    <ReceiptPanel
      rows={rows}
      subtotal={subtotal}
      disc={disc}
      total={total}
      discount={discount}
      parkedCount={parked.length}
      onPay={() => setPayOpen(true)}
    />
  )

  return (
    <div className="reg">
      <div className="reg-main">
        <div className="reg-top">
          <form className="searchbar" onSubmit={onSearchSubmit}>
            <Search className="ico" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('regSearch')}
              enterKeyHint="search"
              autoComplete="off"
            />
          </form>
          <button className={camera ? 'btn' : 'btn secondary'} onClick={() => setCamera(!camera)} aria-label={camera ? t('hideCamera') : t('showCamera')}>
            <Camera className="ico" />
            <span className="hide-sm">{camera ? t('hideCamera') : t('showCamera')}</span>
          </button>
        </div>

        {camera && <Scanner onDetect={(c) => onCode(c, false)} cooldownMs={1500} />}

        <div className="reg-status">
          {shift ? (
            <Link to="/shift" className="shift-chip">
              <span className="dot" /> {t('shiftSince')} {new Date(shift.openedAt).toLocaleTimeString('ru-RU', { timeStyle: 'short' })}
            </Link>
          ) : (
            <Link to="/shift" className="shift-chip off">
              {t('shiftNotOpen')}
            </Link>
          )}
          <span className="hint-keys">
            <kbd>F2</kbd> {t('search').split(' ')[0].toLowerCase()} · <kbd>F4</kbd> {t('payButton').toLowerCase()}
          </span>
        </div>

        {missing && (
          <div className="notice error">
            {t('notFound')}: {missing}
            <Link to={`/products/new?barcode=${encodeURIComponent(missing)}`} className="grow" style={{ textAlign: 'right' }}>
              + {t('addProduct')}
            </Link>
          </div>
        )}

        <div className="chips scroll">
          <button className={cat === '' ? 'chip active' : 'chip'} onClick={() => setCat('')}>
            {t('quickTab')}
          </button>
          {(categories ?? []).map((c) => (
            <button key={c} className={cat === c ? 'chip active' : 'chip'} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>

        {tiles.length > 0 ? (
          <div className="tiles">
            {tiles.map((p) => {
              const n = inCart(p.id)
              return (
                <button
                  key={p.id}
                  className={p.stock <= p.minStock && p.minStock > 0 ? 'tile low' : 'tile'}
                  style={{ ['--h' as string]: hue(p.category || p.name) }}
                  onClick={() => add(p)}
                >
                  {n > 0 && <span className="tile-count">{qtyText(n)}</span>}
                  <span className="tile-name">{p.name}</span>
                  <span className="tile-foot">
                    <span className="tile-price">
                      {money(p.sellPrice).replace(' ₸', '')}
                      <small> ₸{p.unit === 'kg' ? '/кг' : ''}</small>
                    </span>
                    <span className="tile-stock">{qtyText(p.stock)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : tilesQ === undefined ? null : (
          <div className="empty">
            <Search className="ico" />
            <b>{q.trim() || cat ? t('nothingFound') : (productCount ?? 0) === 0 ? t('noProducts') : t('quickTab')}</b>
            {!q.trim() && !cat && (productCount ?? 0) > 0 && <p>{t('noQuick')}</p>}
          </div>
        )}
      </div>

      <div className="receipt-col">{panel}</div>

      {rows.length > 0 && (
        <button className="cart-bar" onClick={() => setSheet(true)}>
          <span className="cb-info">
            <ShoppingCart className="ico" />
            {rows.length} {t('positions')}
          </span>
          <span className="cb-total">{money(total)}</span>
        </button>
      )}

      {sheet && (
        <div className="modal" onClick={() => setSheet(false)}>
          <div className="modal-body cart-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost icon" onClick={() => setSheet(false)} aria-label={t('cancel')}>
                <X className="ico" />
              </button>
            </div>
            {panel}
          </div>
        </div>
      )}

      {payOpen && rows.length > 0 && (
        <PayModal total={total} onClose={() => setPayOpen(false)} onConfirm={finish} count={count} />
      )}

      {done && (
        <div className="modal">
          <div className="modal-body">
            <div className="done">
              <div className="tick">
                <Check className="ico" />
              </div>
              <h2>{t('saleDone')}</h2>
              <div className="amount num">{money(done.total)}</div>
              {done.change > 0 && (
                <div className="change-box">
                  <span>{t('change')}</span>
                  <span className="amount num">{money(done.change)}</span>
                </div>
              )}
              <div className="row mt">
                <button className="btn secondary grow big" onClick={printReceiptNow}>
                  <Printer className="ico" /> {t('printReceipt')}
                </button>
                <button className="btn gold grow big" autoFocus onClick={newSale}>
                  {t('newSale')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <PrintReceipt data={done?.print ?? null} />

      {toast && (
        <div className={toast.err ? 'toast err' : 'toast'} role="status">
          {toast.err ? <X className="ico sm" /> : <Check className="ico sm" />} {toast.text}
        </div>
      )}
    </div>
  )
}

/** Чек-лента: позиции, скидка, итог и кнопка оплаты. */
function ReceiptPanel({
  rows,
  subtotal,
  disc,
  total,
  discount,
  parkedCount,
  onPay,
}: {
  rows: Row[]
  subtotal: number
  disc: number
  total: number
  discount: Discount | null
  parkedCount: number
  onPay: () => void
}) {
  const { t } = useI18n()
  const { parked } = useCart()
  const [discOpen, setDiscOpen] = useState(false)
  const [kind, setKind] = useState<Discount['kind']>(discount?.kind ?? 'percent')
  const [val, setVal] = useState(discount ? String(discount.value) : '')

  const applyDiscount = () => {
    const v = num(val)
    cart.setDiscount(v > 0 ? { kind, value: v } : null)
    setDiscOpen(false)
  }

  return (
    <div className="receipt-wrap">
      <div className="receipt">
        <div className="r-head">
          <h2>
            {t('receiptTitle2')}
            {rows.length > 0 && (
              <span className="muted small">
                {' '}
                · {rows.length} {t('positions')}
              </span>
            )}
          </h2>
          <div className="r-actions">
            <button className="link" onClick={() => cart.park()} disabled={!rows.length} title={t('park')} aria-label={t('park')}>
              <Pause className="ico sm" />
            </button>
            <button className="link" onClick={() => cart.clear()} disabled={!rows.length} title={t('clearCart')} aria-label={t('clearCart')}>
              <Trash2 className="ico sm" />
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="r-empty">
            <Receipt className="ico" />
            <b>{t('emptyReceiptTitle')}</b>
            <span>{t('emptyReceiptHint')}</span>
          </div>
        ) : (
          <div className="r-lines">
            {rows.map(({ product: p, qty, sum }) => (
              <div className="r-line" key={p.id}>
                <div className="r-line-top">
                  <span className="r-name">{p.name}</span>
                  <span className="r-sum">{money(sum)}</span>
                </div>
                <div className="r-line-bot">
                  <QtyInput value={qty} step={p.unit === 'kg' ? 0.1 : 1} onChange={(v) => cart.setQty(p.id, v)} />
                  <span>
                    {money(p.sellPrice)} / {t(p.unit === 'kg' ? 'kg' : 'pcs')}
                  </span>
                  <button className="link" onClick={() => cart.remove(p.id)} aria-label={t('remove')}>
                    <X className="ico sm" />
                  </button>
                </div>
                {qty > p.stock && (
                  <div className="small warn">
                    {t('lowStockWarn')}: {qtyText(p.stock)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {parkedCount > 0 && (
          <div className="parked-strip" aria-label={t('parkedTitle')}>
            {parked.map((p, i) => (
              <span key={p.id} className="row" style={{ gap: 0 }}>
                <button className="chip" onClick={() => cart.resume(p.id)} title={t('resume')}>
                  {t('resume')} #{i + 1} · {p.lines.length}
                </button>
                <button className="link" onClick={() => cart.dropParked(p.id)} aria-label={t('remove')}>
                  <X className="ico sm" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="r-totals">
          {rows.length > 0 && discOpen && (
            <div className="discount-box">
              <div className="row">
                <select value={kind} onChange={(e) => setKind(e.target.value as Discount['kind'])} style={{ width: 90 }}>
                  <option value="percent">%</option>
                  <option value="amount">₸</option>
                </select>
                <input inputMode="decimal" autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="0" />
                <button className="btn" onClick={applyDiscount}>
                  {t('discountApply')}
                </button>
              </div>
            </div>
          )}
          {rows.length > 0 && (
            <>
              <div className="r-row">
                <span className="muted">{t('subtotal')}</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="r-row">
                <button className="link" style={{ padding: '2px 0' }} onClick={() => (disc > 0 ? (cart.setDiscount(null), setVal('')) : setDiscOpen(!discOpen))}>
                  <Percent className="ico sm" /> {disc > 0 ? t('discountRemove') : t('discount')}
                </button>
                <span>{disc > 0 ? `−${money(disc)}` : ''}</span>
              </div>
            </>
          )}
          <div className="r-grand">
            <span>{t('totalLabel')}</span>
            <span className="amount num">{money(total)}</span>
          </div>
          <div className="r-buttons">
            <button className="btn gold big" disabled={!rows.length} onClick={onPay}>
              {t('payButton')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Окно оплаты: наличные со сдачей, карта, смешанная, в долг. */
function PayModal({
  total,
  count,
  onClose,
  onConfirm,
}: {
  total: number
  count: number
  onClose: () => void
  onConfirm: (pay: { cash: number; card: number; debt: number; customer?: Customer }, change: number) => void
}) {
  const { t } = useI18n()
  const [method, setMethod] = useState<Pay>('cash')
  const [received, setReceived] = useState('')
  const [cashPart, setCashPart] = useState('')
  const [paidNow, setPaidNow] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [busy, setBusy] = useState(false)

  const quick = useMemo(() => {
    const out = new Set<number>()
    for (const step of [1000, 5000, 10000, 20000]) {
      const v = Math.ceil(total / step) * step
      if (v > total) out.add(v)
    }
    return [...out].slice(0, 3)
  }, [total])

  const recv = received.trim() === '' ? total : num(received)
  const change = Math.max(recv - total, 0)
  const split = Math.min(Math.max(num(cashPart), 0), total)
  const paid = Math.min(Math.max(num(paidNow), 0), total)

  let ok = false
  let pay = { cash: 0, card: 0, debt: 0 }
  let chg = 0
  if (method === 'cash') {
    ok = recv >= total
    pay = { cash: total, card: 0, debt: 0 }
    chg = change
  } else if (method === 'card') {
    ok = true
    pay = { cash: 0, card: total, debt: 0 }
  } else if (method === 'split') {
    ok = split > 0 && split < total
    pay = { cash: split, card: total - split, debt: 0 }
  } else {
    ok = !!customer && paid < total
    pay = { cash: paid, card: 0, debt: total - paid }
  }

  const go = async () => {
    if (!ok || busy) return
    setBusy(true)
    await onConfirm({ ...pay, customer: method === 'debt' ? (customer ?? undefined) : undefined }, chg)
  }

  const tabs: { id: Pay; label: string; icon: React.ReactNode }[] = [
    { id: 'cash', label: t('payCash'), icon: <Banknote className="ico" /> },
    { id: 'card', label: t('payCard'), icon: <CreditCard className="ico" /> },
    { id: 'split', label: t('paySplit'), icon: <Layers className="ico" /> },
    { id: 'debt', label: t('payDebt'), icon: <BookOpen className="ico" /> },
  ]

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('payTitle')}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label={t('cancel')}>
            <X className="ico" />
          </button>
        </div>
        <div className="pay-total">
          <div className="muted small">
            {count} {t('positions')}
          </div>
          <div className="amount num">{money(total)}</div>
        </div>

        <div className="seg">
          {tabs.map((x) => (
            <button key={x.id} className={method === x.id ? 'active' : ''} onClick={() => setMethod(x.id)}>
              {x.icon}
              {x.label}
            </button>
          ))}
        </div>

        {method === 'cash' && (
          <>
            <label>
              {t('received')}, ₸
              <input
                inputMode="decimal"
                autoFocus
                value={received}
                placeholder={String(total)}
                onChange={(e) => setReceived(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && go()}
              />
            </label>
            <div className="quick-amounts">
              <button className="chip" onClick={() => setReceived('')}>
                {t('exactAmount')}
              </button>
              {quick.map((v) => (
                <button key={v} className="chip" onClick={() => setReceived(String(v))}>
                  {money(v)}
                </button>
              ))}
            </div>
            <div className={recv >= total ? 'change-box' : 'change-box short'}>
              <span>{recv >= total ? t('change') : t('remaining')}</span>
              <span className="amount num">{money(recv >= total ? change : total - recv)}</span>
            </div>
          </>
        )}

        {method === 'split' && (
          <>
            <label>
              {t('cashPart')}, ₸
              <input inputMode="decimal" autoFocus value={cashPart} placeholder="0" onChange={(e) => setCashPart(e.target.value)} />
            </label>
            <div className="kv">
              <span>{t('cardPart')}</span>
              <b className="num">{money(Math.max(total - split, 0))}</b>
            </div>
          </>
        )}

        {method === 'debt' &&
          (!customer ? (
            <>
              <p className="muted small" style={{ marginBottom: 8 }}>
                {t('chooseCustomer')}
              </p>
              <CustomerPicker onSelect={setCustomer} />
            </>
          ) : (
            <>
              <div className="card row between">
                <div>
                  <div className="li-name">{customer.name}</div>
                  {customer.phone && <div className="muted small">{customer.phone}</div>}
                </div>
                <button className="link" onClick={() => setCustomer(null)}>
                  {t('changeCustomer')}
                </button>
              </div>
              <label>
                {t('paidNow')}, ₸
                <input inputMode="decimal" value={paidNow} placeholder="0" onChange={(e) => setPaidNow(e.target.value)} />
              </label>
              <div className="kv total">
                <span>{t('debtAmount')}</span>
                <b className="debt num">{money(total - paid)}</b>
              </div>
            </>
          ))}

        <button className="btn gold big block" disabled={!ok || busy} onClick={go}>
          {t('completeSale')}
        </button>
      </div>
    </div>
  )
}
