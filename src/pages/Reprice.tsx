import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check } from 'lucide-react'
import { db, repriceProducts } from '../db'
import { money, useI18n } from '../i18n'
import { num } from './ProductForm'

type Mode = 'percent' | 'markup'

export default function Reprice() {
  const { t } = useI18n()
  const products = useLiveQuery(() => db.products.toArray(), [])
  const [scope, setScope] = useState('')
  const [mode, setMode] = useState<Mode>('percent')
  const [value, setValue] = useState('')
  const [step, setStep] = useState(10)
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)

  const categories = useMemo(() => [...new Set((products ?? []).map((p) => p.category).filter(Boolean))].sort(), [products])

  const plan = useMemo(() => {
    const v = num(value)
    const list = (products ?? []).filter((p) => !scope || p.category === scope)
    let skipped = 0
    const changes: { id: string; name: string; old: number; next: number }[] = []
    if (v === 0 && mode === 'percent') return { changes, skipped }
    for (const p of list) {
      let next: number
      if (mode === 'percent') next = p.sellPrice * (1 + v / 100)
      else {
        if (p.buyPrice <= 0) {
          skipped++
          continue
        }
        next = p.buyPrice * (1 + v / 100)
      }
      next = step > 1 ? Math.round(next / step) * step : Math.round(next)
      if (next > 0 && next !== p.sellPrice) changes.push({ id: p.id, name: p.name, old: p.sellPrice, next })
    }
    return { changes, skipped }
  }, [products, scope, mode, value, step])

  const apply = async () => {
    if (!plan.changes.length) return
    setBusy(true)
    await repriceProducts(plan.changes.map((c) => ({ id: c.id, sellPrice: c.next })))
    setDone(plan.changes.length)
    setValue('')
    setBusy(false)
  }

  const steps = [1, 10, 50, 100]

  return (
    <div className="page">
      <Link to="/stock" className="back">
        <ArrowLeft className="ico sm" /> {t('stockTitle')}
      </Link>
      <div className="page-head">
        <div>
          <h1>{t('repriceTitle')}</h1>
          <div className="sub">{t('repriceHint')}</div>
        </div>
      </div>

      {done > 0 && (
        <div className="notice ok">
          <Check className="ico" /> {done} · {t('repriceDone')}
        </div>
      )}

      <div className="card">
        <label>
          {t('repriceScope')}
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">{t('scopeAll')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="field-label muted small">{t('repriceMode')}</div>
        <div className="chips">
          <button className={mode === 'percent' ? 'chip active' : 'chip'} onClick={() => setMode('percent')}>
            {t('modePercent')}
          </button>
          <button className={mode === 'markup' ? 'chip active' : 'chip'} onClick={() => setMode('markup')}>
            {t('modeMarkup')}
          </button>
        </div>

        <label>
          {t('repriceValue')}, %{mode === 'percent' ? ' (−5, 10…)' : ''}
          <input inputMode="decimal" value={value} placeholder="0" onChange={(e) => setValue(e.target.value)} />
        </label>

        <div className="field-label muted small">{t('repriceRound')}</div>
        <div className="chips">
          {steps.map((s) => (
            <button key={s} className={step === s ? 'chip active' : 'chip'} onClick={() => setStep(s)}>
              {s === 1 ? t('roundNone') : `${s} ₸`}
            </button>
          ))}
        </div>
      </div>

      {value.trim() !== '' && (
        <>
          <h2>
            {t('repricePreview')} · {plan.changes.length}
          </h2>
          {plan.skipped > 0 && (
            <div className="notice warn">
              {t('repriceSkipped')}: {plan.skipped}
            </div>
          )}
          {plan.changes.length === 0 ? (
            <p className="muted">{t('repriceNothing')}</p>
          ) : (
            <>
              <ul className="list">
                {plan.changes.slice(0, 30).map((c) => (
                  <li key={c.id} className="list-item static">
                    <span className="grow li-name">{c.name}</span>
                    <span className="muted num" style={{ textDecoration: 'line-through' }}>
                      {money(c.old)}
                    </span>
                    <b className={c.next > c.old ? 'num' : 'num ok-text'}>{money(c.next)}</b>
                  </li>
                ))}
              </ul>
              {plan.changes.length > 30 && <p className="muted small">+ {plan.changes.length - 30}</p>}
              <button className="btn big block" disabled={busy} onClick={apply}>
                {t('repriceApply')} ({plan.changes.length})
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
