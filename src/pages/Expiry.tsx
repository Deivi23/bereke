import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Hourglass } from 'lucide-react'
import { db } from '../db'
import { daysUntil, fmtDay } from '../dates'
import { money, qtyText, useI18n } from '../i18n'

export default function Expiry() {
  const { t } = useI18n()
  const [within, setWithin] = useState(7)
  const products = useLiveQuery(
    async () =>
      (await db.products.filter((p) => p.stock > 0 && p.expiry !== undefined).toArray()).sort((a, b) => a.expiry! - b.expiry!),
    [],
  )

  const rows = (products ?? []).map((p) => ({ p, days: daysUntil(p.expiry!) }))
  const expired = rows.filter((r) => r.days < 0)
  const soon = rows.filter((r) => r.days >= 0 && r.days <= within)
  const expiredCost = expired.reduce((s, r) => s + r.p.stock * r.p.buyPrice, 0)

  const Row = ({ p, days }: { p: (typeof rows)[number]['p']; days: number }) => (
    <li className="list-item static" style={{ alignItems: 'flex-start' }}>
      <div className="grow">
        <div className="li-name">{p.name}</div>
        <div className="li-sub">
          {fmtDay(p.expiry!)} · {qtyText(p.stock)} {t(p.unit === 'kg' ? 'kg' : 'pcs')} · {money(p.stock * p.buyPrice)}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span className={days < 0 ? 'badge danger' : days <= 3 ? 'badge warn' : 'badge'}>
          {days < 0 ? t('expiredBadge') : days === 0 ? t('filterToday') : `${days} ${t('daysLeft')}`}
        </span>
        <div>
          <Link className="link small" to={`/stock/writeoff?product=${p.id}`}>
            {t('writeoffRest')}
          </Link>
        </div>
      </div>
    </li>
  )

  return (
    <div className="page">
      <Link to="/stock" className="back">
        <ArrowLeft className="ico sm" /> {t('stockTitle')}
      </Link>
      <div className="page-head">
        <h1>{t('expiryTitle')}</h1>
      </div>

      <div className="chips">
        <span className="muted small" style={{ alignSelf: 'center' }}>
          {t('expiryWithin')}:
        </span>
        {[3, 7, 14, 30].map((d) => (
          <button key={d} className={within === d ? 'chip active' : 'chip'} onClick={() => setWithin(d)}>
            {d} {t('daysLeft')}
          </button>
        ))}
      </div>

      {products && expired.length === 0 && soon.length === 0 && (
        <div className="empty">
          <Hourglass className="ico" />
          <b>{t('expiryAllGood')}</b>
        </div>
      )}

      {expired.length > 0 && (
        <>
          <h2 className="debt">
            {t('expiredBadge')} · {expired.length}
          </h2>
          <div className="muted small num">
            {t('expiredTotal')}: {money(expiredCost)}
          </div>
          <ul className="list">
            {expired.map((r) => (
              <Row key={r.p.id} {...r} />
            ))}
          </ul>
        </>
      )}

      {soon.length > 0 && (
        <>
          <h2>
            {t('hubExpiry')} · {soon.length}
          </h2>
          <ul className="list">
            {soon.map((r) => (
              <Row key={r.p.id} {...r} />
            ))}
          </ul>
        </>
      )}

      <p className="muted small mt">{t('expiryHint')}</p>
    </div>
  )
}
