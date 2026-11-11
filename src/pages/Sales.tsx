import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, History } from 'lucide-react'
import { db } from '../db'
import { money, useI18n } from '../i18n'

type Range = 'today' | 'yesterday' | 'week' | 'all'

const startOfDay = (offsetDays = 0) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.getTime()
}

export default function Sales() {
  const { t } = useI18n()
  const [range, setRange] = useState<Range>('today')

  const data = useLiveQuery(async () => {
    let from = 0
    let to = Infinity
    if (range === 'today') from = startOfDay()
    else if (range === 'yesterday') {
      from = startOfDay(-1)
      to = startOfDay()
    } else if (range === 'week') from = startOfDay(-6)
    const sales = (await db.sales.where('date').between(from, to, true, false).reverse().limit(500).toArray())
    const refunds = await db.refunds.toArray()
    return { sales, refunded: new Set(refunds.map((r) => r.saleId)) }
  }, [range])

  const sales = data?.sales ?? []
  const sum = sales.reduce((s, x) => s + x.total, 0)

  const groups: { day: string; items: typeof sales }[] = []
  for (const s of sales) {
    const day = new Date(s.date).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
    const g = groups[groups.length - 1]
    if (g && g.day === day) g.items.push(s)
    else groups.push({ day, items: [s] })
  }

  const ranges: [Range, string][] = [
    ['today', t('filterToday')],
    ['yesterday', t('filterYesterday')],
    ['week', t('filterWeek')],
    ['all', t('filterAll')],
  ]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('salesTitle')}</h1>
          <div className="sub num">
            {sales.length} {t('salesWord')} · {money(sum)}
          </div>
        </div>
      </div>

      <div className="chips">
        {ranges.map(([id, label]) => (
          <button key={id} className={range === id ? 'chip active' : 'chip'} onClick={() => setRange(id)}>
            {label}
          </button>
        ))}
      </div>

      {data && sales.length === 0 && (
        <div className="empty">
          <History className="ico" />
          <b>{t('noSales')}</b>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.day}>
          {range !== 'today' && <div className="day-title">{g.day}</div>}
          <ul className="list">
            {g.items.map((s) => (
              <li key={s.id}>
                <Link to={`/sales/${s.id}`} className="list-item">
                  <div className="grow">
                    <div className="li-name num">
                      {new Date(s.date).toLocaleTimeString('ru-RU', { timeStyle: 'short' })} · {s.items.length} {t('positions')}
                    </div>
                    <div className="pay-tags">
                      {s.cash > 0 && <span className="badge">{t('cashShort')}</span>}
                      {s.card > 0 && <span className="badge primary">{t('cardShort')}</span>}
                      {s.debt > 0 && <span className="badge danger">{t('debtShort')} {money(s.debt)}</span>}
                      {data!.refunded.has(s.id) && <span className="badge warn">{t('refundedBadge')}</span>}
                    </div>
                  </div>
                  <span className="li-price">{money(s.total)}</span>
                  <ChevronRight className="ico sm muted" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
