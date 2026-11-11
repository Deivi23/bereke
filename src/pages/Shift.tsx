import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Clock } from 'lucide-react'
import { closeShift, db, openShift, type Shift as ShiftT } from '../db'
import { shiftReport, type ShiftReport } from '../reports'
import { fmtDate, money, useI18n } from '../i18n'
import { num } from './ProductForm'

function Report({ r, opening }: { r: ShiftReport; opening: number }) {
  const { t } = useI18n()
  const refunds = r.refundsCash + r.refundsCard + r.refundsDebt
  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <div className="v">{money(r.revenue - refunds)}</div>
          <div className="l">{t('revenue')}</div>
        </div>
        <div className="stat">
          <div className="v">{r.salesCount}</div>
          <div className="l">{t('salesCountLabel')}</div>
        </div>
        <div className="stat">
          <div className="v">{money(r.cash)}</div>
          <div className="l">{t('cashSales')}</div>
        </div>
        <div className="stat">
          <div className="v">{money(r.card)}</div>
          <div className="l">{t('cardSales')}</div>
        </div>
        <div className="stat">
          <div className="v">{money(r.debt)}</div>
          <div className="l">{t('debtSales')}</div>
        </div>
      </div>
      <div className="card">
        <div className="kv">
          <span>{t('openingCash')}</span>
          <span>{money(opening)}</span>
        </div>
        <div className="kv">
          <span>+ {t('cashSales')}</span>
          <span>{money(r.cash)}</span>
        </div>
        {r.debtPaidCash > 0 && (
          <div className="kv">
            <span>+ {t('debtPaid')}</span>
            <span>{money(r.debtPaidCash)}</span>
          </div>
        )}
        {r.refundsCash > 0 && (
          <div className="kv">
            <span>− {t('refundsLabel')}</span>
            <span>{money(r.refundsCash)}</span>
          </div>
        )}
        <div className="kv total">
          <span>{t('expectedCash')}</span>
          <span>{money(r.expectedCash)}</span>
        </div>
        {(r.discounts > 0 || refunds > 0 || r.debtPaidCard > 0) && (
          <div className="muted small" style={{ marginTop: 8 }}>
            {r.discounts > 0 && <>{t('discountsLabel')}: {money(r.discounts)}. </>}
            {refunds > 0 && <>{t('refundsLabel')}: {money(refunds)}. </>}
            {r.debtPaidCard > 0 && <>{t('debtPaid')} ({t('payCard').toLowerCase()}): {money(r.debtPaidCard)}.</>}
          </div>
        )}
      </div>
    </>
  )
}

function ClosedShift({ s }: { s: ShiftT }) {
  const { t } = useI18n()
  const r = useLiveQuery(() => shiftReport(s), [s.id])
  const diff = (s.countedCash ?? 0) - (r?.expectedCash ?? 0)
  return (
    <li className="list-item static" style={{ alignItems: 'flex-start' }}>
      <div className="grow">
        <div className="li-name">{fmtDate(s.openedAt)}</div>
        <div className="muted small">
          {t('closedAt')} {s.closedAt ? fmtDate(s.closedAt) : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="li-price">{money(r?.revenue ?? 0)}</div>
        {r &&
          (diff === 0 ? (
            <span className="badge ok">{t('matches')}</span>
          ) : (
            <span className={diff < 0 ? 'badge danger' : 'badge warn'}>
              {diff < 0 ? t('shortage') : t('surplus')} {money(Math.abs(diff))}
            </span>
          ))}
      </div>
    </li>
  )
}

export default function Shift() {
  const { t } = useI18n()
  const shift = useLiveQuery(() => db.shifts.filter((s) => !s.closedAt).first(), [], null)
  const closed = useLiveQuery(async () => (await db.shifts.filter((s) => !!s.closedAt).toArray()).sort((a, b) => b.openedAt - a.openedAt).slice(0, 30), [])
  const report = useLiveQuery(() => (shift ? shiftReport(shift) : undefined), [shift?.id])
  const [opening, setOpening] = useState('')
  const [counted, setCounted] = useState('')
  const [closing, setClosing] = useState(false)

  if (shift === null) return null // загрузка

  const diff = report ? num(counted) - report.expectedCash : 0

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('shiftTitle')}</h1>
          {shift && (
            <div className="sub">
              {t('shiftIsOpen')} · {fmtDate(shift.openedAt)}
            </div>
          )}
        </div>
      </div>

      {!shift ? (
        <div className="card">
          <p className="muted">{t('shiftHint')}</p>
          <div className="gap" />
          <label>
            {t('openingCash')}, ₸
            <input inputMode="decimal" value={opening} placeholder="0" onChange={(e) => setOpening(e.target.value)} />
          </label>
          <button className="btn big block" onClick={() => openShift(Math.max(num(opening), 0)).then(() => setOpening(''))}>
            <Clock className="ico" /> {t('openShift')}
          </button>
        </div>
      ) : (
        <>
          {report && <Report r={report} opening={shift.openingCash} />}
          {!closing ? (
            <button className="btn secondary big block" onClick={() => setClosing(true)}>
              {t('closeShift')}
            </button>
          ) : (
            <div className="card">
              <label>
                {t('countedCash')}, ₸
                <input inputMode="decimal" autoFocus value={counted} placeholder={String(report?.expectedCash ?? 0)} onChange={(e) => setCounted(e.target.value)} />
              </label>
              {counted.trim() !== '' && report && (
                <div className={diff === 0 ? 'change-box' : diff < 0 ? 'change-box short' : 'notice warn'}>
                  <span>{diff === 0 ? t('matches') : diff < 0 ? t('shortage') : t('surplus')}</span>
                  <span className="amount num">{diff === 0 ? '' : money(Math.abs(diff))}</span>
                </div>
              )}
              <div className="row">
                <button
                  className="btn big grow"
                  disabled={counted.trim() === ''}
                  onClick={async () => {
                    await closeShift(shift.id, Math.max(num(counted), 0))
                    setClosing(false)
                    setCounted('')
                  }}
                >
                  {t('closeShift')}
                </button>
                <button className="btn secondary big" onClick={() => setClosing(false)}>
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <h2>{t('pastShifts')}</h2>
      {closed && closed.length === 0 ? (
        <p className="muted">{t('noShifts')}</p>
      ) : (
        <ul className="list">{closed?.map((s) => <ClosedShift key={s.id} s={s} />)}</ul>
      )}
    </div>
  )
}
