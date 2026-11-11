import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check, X } from 'lucide-react'
import { commitInventory, db, type Product } from '../db'
import { fmtDate, money, qtyText, useI18n } from '../i18n'
import ProductPicker from '../components/ProductPicker'
import QtyInput from '../components/QtyInput'

interface Count {
  productId: string
  counted: number
}

const KEY = 'inventory-draft'

function loadDraft(): Count[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x?.productId === 'string' && typeof x?.counted === 'number') : []
  } catch {
    return []
  }
}

export default function Inventory() {
  const { t } = useI18n()
  // Черновик хранится на устройстве, чтобы пересчёт не терялся при переходе на другую страницу
  const [counts, setCounts] = useState<Count[]>(loadDraft)
  const [result, setResult] = useState<{ shortage: number; surplus: number } | null>(null)
  const ids = counts.map((c) => c.productId)
  const products = useLiveQuery(() => db.products.bulkGet(ids), [ids.join(',')])
  const history = useLiveQuery(() => db.inventories.orderBy('date').reverse().limit(10).toArray(), [])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(counts))
    } catch {
      /* ignore */
    }
  }, [counts])

  const byId = useMemo(() => {
    const m = new Map<string, Product>()
    products?.forEach((p) => p && m.set(p.id, p))
    return m
  }, [products])

  const add = (p: Product) => {
    setResult(null)
    setCounts((cs) => {
      const i = cs.findIndex((c) => c.productId === p.id)
      if (i >= 0) return cs.map((c, j) => (j === i ? { ...c, counted: Math.round((c.counted + 1) * 1000) / 1000 } : c))
      // Новая позиция идёт наверх, чтобы последний отсканированный был на виду
      return [{ productId: p.id, counted: 1 }, ...cs]
    })
  }

  const rows = counts.map((c) => ({ c, p: byId.get(c.productId) })).filter((r): r is { c: Count; p: Product } => !!r.p)
  const diffTotal = rows.reduce((s, r) => s + (r.c.counted - r.p.stock) * r.p.buyPrice, 0)

  const finish = async () => {
    if (!rows.length || !confirm(t('invConfirm'))) return
    const r = await commitInventory(counts)
    setCounts([])
    if (r) setResult(r)
  }

  return (
    <div className="page">
      <Link to="/stock" className="back">
        <ArrowLeft className="ico sm" /> {t('stockTitle')}
      </Link>
      <div className="page-head">
        <h1>{t('invTitle')}</h1>
      </div>

      {result && (
        <div className="card">
          <div className="notice ok">
            <Check className="ico" /> {t('invDone')}
          </div>
          <div className="kv">
            <span>{t('shortage')}</span>
            <b className="debt num">{money(result.shortage)}</b>
          </div>
          <div className="kv">
            <span>{t('surplus')}</span>
            <b className="num">{money(result.surplus)}</b>
          </div>
        </div>
      )}

      <p className="muted small" style={{ marginBottom: 10 }}>
        {t('invHint')}
      </p>
      <ProductPicker onPick={add} />

      {rows.length === 0 && !result && <p className="muted center mt">{t('invEmpty')}</p>}

      {rows.map(({ c, p }) => {
        const diff = Math.round((c.counted - p.stock) * 1000) / 1000
        return (
          <div className="card" key={p.id}>
            <div className="row between">
              <b>{p.name}</b>
              <button className="link" onClick={() => setCounts(counts.filter((x) => x.productId !== p.id))} aria-label={t('remove')}>
                <X className="ico sm" />
              </button>
            </div>
            <div className="row between mt">
              <QtyInput
                value={c.counted}
                step={p.unit === 'kg' ? 0.1 : 1}
                onChange={(v) => setCounts(counts.map((x) => (x.productId === p.id ? { ...x, counted: v } : x)))}
              />
              <div style={{ textAlign: 'right' }}>
                <div className="muted small">
                  {t('invExpected')}: {qtyText(p.stock)}
                </div>
                <b className={diff === 0 ? 'ok-text' : diff < 0 ? 'debt' : 'warn'}>
                  {diff === 0 ? t('matches') : `${diff > 0 ? '+' : ''}${qtyText(diff)}`}
                </b>
              </div>
            </div>
          </div>
        )
      })}

      {rows.length > 0 && (
        <div className="sticky-total">
          <div className="row between">
            <span className="muted">{t('invDiff')}</span>
            <b className={diffTotal < 0 ? 'debt num' : 'num'}>{money(Math.round(diffTotal))}</b>
          </div>
          <div className="muted small">{t('invUntouched')}</div>
          <div className="row">
            <button className="btn big grow" onClick={finish}>
              {t('invFinish')}
            </button>
            <button className="btn secondary big" onClick={() => setCounts([])}>
              {t('invReset')}
            </button>
          </div>
        </div>
      )}

      {history && history.length > 0 && (
        <>
          <h2>{t('invHistory')}</h2>
          <ul className="list">
            {history.map((inv) => {
              const bad = inv.items.filter((i) => i.counted !== i.expected).length
              return (
                <li key={inv.id} className="list-item static">
                  <div className="grow">
                    <div className="li-name">{fmtDate(inv.date)}</div>
                    <div className="li-sub">
                      {inv.items.length} {t('abcItems')} · {t('invDiff').toLowerCase()}: {bad}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
