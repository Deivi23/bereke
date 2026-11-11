import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart3, Download, TrendingDown, TrendingUp } from 'lucide-react'
import { db } from '../db'
import { computeAnalytics, fillDays, startOfDay, summarizeStock } from '../analytics'
import { buildCsv } from '../csv'
import { money, qtyText, useI18n } from '../i18n'
import { BarChart, RankList, SegmentBar, type Bar } from '../components/charts'

type Period = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'all'
type Rank = 'revenue' | 'profit' | 'qty'

const DAY = 864e5

function range(p: Period): { from: number; to: number } {
  const today = startOfDay(Date.now())
  const tomorrow = today + DAY
  switch (p) {
    case 'today':
      return { from: today, to: tomorrow }
    case 'yesterday':
      return { from: today - DAY, to: today }
    case '7d':
      return { from: today - 6 * DAY, to: tomorrow }
    case '30d':
      return { from: today - 29 * DAY, to: tomorrow }
    case 'month': {
      const d = new Date()
      d.setDate(1)
      d.setHours(0, 0, 0, 0)
      return { from: d.getTime(), to: tomorrow }
    }
    default:
      return { from: 0, to: tomorrow }
  }
}

function Delta({ now, prev }: { now: number; prev: number | null }) {
  const { t } = useI18n()
  if (prev === null || prev <= 0) return null
  const pct = Math.round(((now - prev) / prev) * 100)
  if (pct === 0) return null
  const up = pct > 0
  return (
    <div className={up ? 'delta up' : 'delta down'} title={t('vsPrev')}>
      {up ? <TrendingUp className="ico sm" /> : <TrendingDown className="ico sm" />}
      {up ? '+' : ''}
      {pct}%
    </div>
  )
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function Analytics() {
  const { t } = useI18n()
  const [period, setPeriod] = useState<Period>('7d')
  const [rank, setRank] = useState<Rank>('revenue')
  const [all, setAll] = useState(false)

  const data = useLiveQuery(async () => {
    const { from, to } = range(period)
    const load = async (f: number, e: number) => ({
      sales: await db.sales.where('date').between(f, e, true, false).toArray(),
      refunds: await db.refunds.where('date').between(f, e, true, false).toArray(),
    })
    const products = await db.products.toArray()
    const cur = await load(from, to)
    const prevRange = period === 'all' ? null : { from: from - (to - from), to: from }
    const prev = prevRange ? await load(prevRange.from, prevRange.to) : null
    const balances = new Map<string, number>()
    await db.ledger.each((e) => balances.set(e.customerId, (balances.get(e.customerId) ?? 0) + (e.type === 'debt' ? e.amount : -e.amount)))
    const customers = await db.customers.toArray()
    const writeoffs = await db.writeoffs.where('date').between(from, to, true, false).toArray()
    return { from, to, products, cur, prev, balances, customers, writeoffs }
  }, [period])

  const view = useMemo(() => {
    if (!data) return null
    const a = computeAnalytics(data.cur.sales, data.cur.refunds, data.products)
    const p = data.prev ? computeAnalytics(data.prev.sales, data.prev.refunds, data.products) : null
    const sold = new Set(a.products.map((x) => x.id))
    const stock = summarizeStock(data.products, sold)
    const firstDay = a.days[0]?.day ?? startOfDay(Date.now())
    const days = fillDays(a.days, data.from === 0 ? firstDay : data.from, data.to)
    const debtors = data.customers
      .map((c) => ({ c, bal: data.balances.get(c.id) ?? 0 }))
      .filter((x) => x.bal > 0)
      .sort((x, y) => y.bal - x.bal)
    return { a, p, stock, days, debtors, debtTotal: debtors.reduce((s, x) => s + x.bal, 0), writeoffTotal: data.writeoffs.reduce((s, w) => s + w.total, 0) }
  }, [data])

  if (!data || !view) return null
  const { a, p, stock, days, debtors, debtTotal, writeoffTotal } = view

  const periods: [Period, string][] = [
    ['today', t('filterToday')],
    ['yesterday', t('filterYesterday')],
    ['7d', t('filterWeek')],
    ['30d', t('period30')],
    ['month', t('periodMonth')],
    ['all', t('filterAll')],
  ]

  const dayBars: Bar[] = days.map((d) => {
    const dt = new Date(d.day)
    return {
      label: dt.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }),
      tick: dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' }),
      value: d.revenue,
      tip: money(d.revenue),
    }
  })

  const firstH = a.hours.findIndex((v) => v !== 0)
  const lastH = a.hours.reduce((last, v, h) => (v !== 0 ? h : last), -1)
  const hourFrom = Math.min(8, firstH === -1 ? 8 : firstH)
  const hourTo = Math.max(22, lastH)
  const hourBars: Bar[] = []
  for (let h = hourFrom; h <= hourTo; h++) {
    hourBars.push({
      label: `${h}:00–${h + 1}:00 · ${a.hourCounts[h]} ${t('salesWord')}`,
      tick: String(h),
      value: a.hours[h],
      tip: money(a.hours[h]),
    })
  }
  const peak = a.hours.reduce((best, v, h) => (v > a.hours[best] ? h : best), 0)

  const sorted = [...a.products].sort((x, y) => (rank === 'qty' ? y.qty - x.qty : rank === 'profit' ? y.profit - x.profit : y.revenue - x.revenue))
  const shown = sorted.slice(0, all ? 30 : 8)
  const abcStats = (['A', 'B', 'C'] as const).map((k) => {
    const list = a.products.filter((x) => x.abc === k)
    return { k, count: list.length, share: list.reduce((s, x) => s + x.share, 0) }
  })

  const exportProducts = () =>
    download(
      'bereke-products-report.csv',
      buildCsv([
        [t('csvProduct'), t('category'), t('csvQtySold'), t('csvRevenue'), t('csvProfit'), t('csvShare'), t('csvClass')],
        ...a.products.map((x) => [x.name, x.category, x.qty, Math.round(x.revenue), Math.round(x.profit), Math.round(x.share * 1000) / 10, x.abc]),
      ]),
    )
  const exportDays = () =>
    download(
      'bereke-days-report.csv',
      buildCsv([
        [t('csvDay'), t('csvSales'), t('csvRevenue'), t('csvProfit')],
        ...days.map((d) => [new Date(d.day).toLocaleDateString('ru-RU'), d.count, Math.round(d.revenue), Math.round(d.profit)]),
      ]),
    )

  const empty = a.salesCount === 0

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('analyticsTitle')}</h1>
      </div>

      <div className="chips scroll">
        {periods.map(([id, label]) => (
          <button key={id} className={period === id ? 'chip active' : 'chip'} onClick={() => setPeriod(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="stat-grid kpi">
        <div className="stat big">
          <div className="l">{t('revenue')}</div>
          <div className="v">{money(a.revenue)}</div>
          <Delta now={a.revenue} prev={p ? p.revenue : null} />
        </div>
        <div className="stat big">
          <div className="l">{t('profit')}</div>
          <div className="v">{money(a.profit)}</div>
          <Delta now={a.profit} prev={p ? p.profit : null} />
        </div>
        <div className="stat">
          <div className="l">{t('salesCountLabel')}</div>
          <div className="v">{a.salesCount}</div>
          <Delta now={a.salesCount} prev={p ? p.salesCount : null} />
        </div>
        <div className="stat">
          <div className="l">{t('avgCheckLabel')}</div>
          <div className="v">{money(Math.round(a.avgCheck))}</div>
          <Delta now={a.avgCheck} prev={p ? p.avgCheck : null} />
        </div>
      </div>
      <div className="muted small num" style={{ margin: '-2px 2px 8px' }}>
        {t('marginLabel')}: {Math.round(a.marginPct * 10) / 10}%
        {a.discounts > 0 && ` · ${t('discountsLabel')}: ${money(a.discounts)}`}
        {a.refunds > 0 && ` · ${t('refundsLabel')}: ${money(a.refunds)}`}
        {writeoffTotal > 0 && ` · ${t('hubWriteoff')}: ${money(Math.round(writeoffTotal))}`}
      </div>

      {empty ? (
        <div className="empty">
          <BarChart3 className="ico" />
          <b>{t('noData')}</b>
        </div>
      ) : (
        <>
          {days.length > 1 && (
            <div className="card">
              <h3 className="card-title">{t('revenueByDay')}</h3>
              <BarChart bars={dayBars} ariaLabel={t('revenueByDay')} />
            </div>
          )}

          <div className="grid-cards">
            <div className="card">
              <h3 className="card-title">{t('revenueByHour')}</h3>
              <BarChart bars={hourBars} ariaLabel={t('revenueByHour')} />
              {a.hours[peak] > 0 && (
                <p className="muted small" style={{ marginTop: 6 }}>
                  {t('peakHour')}: <b className="num">{peak}:00–{peak + 1}:00</b>
                </p>
              )}
            </div>

            <div className="card">
              <h3 className="card-title">{t('paymentSplit')}</h3>
              <SegmentBar
                ariaLabel={t('paymentSplit')}
                segments={[
                  { label: t('payCash'), value: a.byMethod.cash, color: 'var(--s1)', text: money(a.byMethod.cash) },
                  { label: t('payCard'), value: a.byMethod.card, color: 'var(--s2)', text: money(a.byMethod.card) },
                  { label: t('payDebt'), value: a.byMethod.debt, color: 'var(--s3)', text: money(a.byMethod.debt) },
                ]}
              />
            </div>
          </div>

          <div className="card">
            <div className="row between wrap">
              <h3 className="card-title">{t('topProducts')}</h3>
              <div className="chips" style={{ margin: 0 }}>
                {(['revenue', 'profit', 'qty'] as Rank[]).map((r) => (
                  <button key={r} className={rank === r ? 'chip active' : 'chip'} onClick={() => setRank(r)}>
                    {t(r === 'revenue' ? 'byRevenue' : r === 'profit' ? 'byProfit' : 'byQty')}
                  </button>
                ))}
              </div>
            </div>
            <RankList
              rows={shown.map((x) => ({
                key: x.id,
                name: x.name,
                value: rank === 'qty' ? x.qty : rank === 'profit' ? x.profit : x.revenue,
                text: rank === 'qty' ? `${qtyText(x.qty)} ${t('soldQty')}` : money(rank === 'profit' ? x.profit : x.revenue),
                sub: `${t('csvClass')} ${x.abc} · ${Math.round(x.share * 1000) / 10}% · ${money(x.profit)} ${t('profit').toLowerCase()}`,
              }))}
            />
            {sorted.length > 8 && (
              <button className="btn ghost block" onClick={() => setAll(!all)}>
                {all ? t('showLess') : `${t('showAll')} (${Math.min(sorted.length, 30)})`}
              </button>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">{t('abcTitle')}</h3>
            <div className="stat-grid" style={{ margin: '8px 0' }}>
              {abcStats.map((s) => (
                <div className="stat" key={s.k}>
                  <div className="l">{t(s.k === 'A' ? 'abcA' : s.k === 'B' ? 'abcB' : 'abcC')}</div>
                  <div className="v num">{Math.round(s.share * 100)}%</div>
                  <div className="muted small">
                    {s.count} {t('abcItems')}
                  </div>
                </div>
              ))}
            </div>
            <p className="muted small">{t('abcHint')}</p>
          </div>
        </>
      )}

      <div className="grid-cards">
        <div className="card">
          <h3 className="card-title">{t('stockValue')}</h3>
          <div className="kv">
            <span>{t('atCost')}</span>
            <b className="num">{money(stock.costValue)}</b>
          </div>
          <div className="kv">
            <span>{t('atRetail')}</span>
            <b className="num">{money(stock.retailValue)}</b>
          </div>
          {stock.low.length > 0 && (
            <>
              <div className="day-title">
                {t('lowStockTitle')} · {stock.low.length}
              </div>
              {stock.low.slice(0, 5).map((x) => (
                <Link key={x.id} to={`/products/${x.id}`} className="kv link-row">
                  <span>{x.name}</span>
                  <b className="debt num">{qtyText(x.stock)}</b>
                </Link>
              ))}
              {stock.low.length > 5 && (
                <Link to="/products" className="muted small">
                  {t('more')} {stock.low.length - 5}
                </Link>
              )}
            </>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">{t('debtorsNow')}</h3>
          <div className="stat-v debt num">{money(debtTotal)}</div>
          {debtors.slice(0, 5).map((x) => (
            <Link key={x.c.id} to={`/debts/${x.c.id}`} className="kv link-row">
              <span>{x.c.name}</span>
              <b className="debt num">{money(x.bal)}</b>
            </Link>
          ))}
          {debtors.length > 5 && (
            <Link to="/debts" className="muted small">
              {t('more')} {debtors.length - 5}
            </Link>
          )}
        </div>
      </div>

      {stock.slow.length > 0 && !empty && (
        <div className="card">
          <h3 className="card-title">{t('slowTitle')}</h3>
          <p className="muted small">{t('slowHint')}</p>
          <div className="stat-v num">
            {t('frozenMoney')}: {money(stock.slow.reduce((s, x) => s + x.frozen, 0))}
          </div>
          {stock.slow.slice(0, 8).map((x) => (
            <Link key={x.id} to={`/products/${x.id}`} className="kv link-row">
              <span>
                {x.name} <span className="muted small">· {qtyText(x.stock)}</span>
              </span>
              <b className="num">{money(x.frozen)}</b>
            </Link>
          ))}
        </div>
      )}

      <div className="row wrap mt">
        <button className="btn secondary" onClick={exportProducts} disabled={empty}>
          <Download className="ico" /> {t('exportProducts')}
        </button>
        <button className="btn secondary" onClick={exportDays} disabled={empty}>
          <Download className="ico" /> {t('exportDays')}
        </button>
      </div>
    </div>
  )
}

