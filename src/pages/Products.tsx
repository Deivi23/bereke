import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { money, qtyText, useI18n } from '../i18n'

const PAGE = 80

type Filter = 'all' | 'low' | 'noprice'

export default function Products() {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(PAGE)
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [])

  const shown = useMemo(() => {
    if (!products) return []
    const needle = q.trim().toLowerCase()
    return products.filter((p) => {
      if (filter === 'low' && !(p.minStock > 0 ? p.stock <= p.minStock : p.stock <= 0)) return false
      if (filter === 'noprice' && p.sellPrice > 0) return false
      if (!needle) return true
      return p.name.toLowerCase().includes(needle) || p.barcodes.some((b) => b.includes(needle))
    })
  }, [products, q, filter])

  return (
    <div className="page">
      <div className="row between">
        <h1>
          {t('productsTitle')} {products && <small className="muted">· {products.length}</small>}
        </h1>
        <Link className="btn" to="/products/new">
          + {t('addProduct')}
        </Link>
      </div>

      <input
        type="search"
        value={q}
        placeholder={t('search')}
        onChange={(e) => {
          setQ(e.target.value)
          setLimit(PAGE)
        }}
      />

      <div className="chips">
        {(['all', 'low', 'noprice'] as Filter[]).map((f) => (
          <button
            key={f}
            className={filter === f ? 'chip active' : 'chip'}
            onClick={() => {
              setFilter(f)
              setLimit(PAGE)
            }}
          >
            {t(f === 'all' ? 'all' : f === 'low' ? 'lowStock' : 'noPrice')}
          </button>
        ))}
      </div>

      {products && products.length === 0 && <p className="muted center">{t('noProducts')}</p>}

      <ul className="list">
        {shown.slice(0, limit).map((p) => (
          <li key={p.id}>
            <Link to={`/products/${p.id}`} className="list-item">
              <div>
                <div className="li-name">{p.name}</div>
                <div className="muted small">
                  {p.category && `${p.category} · `}
                  {t('inStock')}: {qtyText(p.stock)} {t(p.unit === 'kg' ? 'kg' : 'pcs')}
                </div>
              </div>
              <div className="li-price">{p.sellPrice > 0 ? money(p.sellPrice) : '—'}</div>
            </Link>
          </li>
        ))}
      </ul>

      {shown.length > limit && (
        <button className="btn secondary block" onClick={() => setLimit(limit + PAGE)}>
          {t('showMore')} ({shown.length - limit})
        </button>
      )}
    </div>
  )
}
