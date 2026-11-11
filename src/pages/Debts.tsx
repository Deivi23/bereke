import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Customer } from '../db'
import { useBalances } from '../hooks'
import { money, useI18n } from '../i18n'

export default function Debts() {
  const { t } = useI18n()
  const nav = useNavigate()
  const customers = useLiveQuery(() => db.customers.toArray(), [])
  const balances = useBalances()
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (customers ?? [])
      .map((c) => ({ c, bal: balances?.get(c.id!) ?? 0 }))
      .filter(({ c, bal }) => {
        if (needle) return c.name.toLowerCase().includes(needle) || c.phone.includes(needle)
        return showAll || bal > 0
      })
      .sort((a, b) => b.bal - a.bal || a.c.name.localeCompare(b.c.name))
  }, [customers, balances, q, showAll])

  const totalDebt = [...(balances?.values() ?? [])].filter((v) => v > 0).reduce((s, v) => s + v, 0)
  const debtors = [...(balances?.values() ?? [])].filter((v) => v > 0).length

  const create = async () => {
    if (!name.trim()) return setError(t('noName'))
    const c: Customer = { name: name.trim(), phone: phone.trim(), createdAt: Date.now() }
    const id = await db.customers.add(c)
    nav(`/debts/${id}`)
  }

  return (
    <div className="page">
      <div className="row between">
        <h1>{t('debtsTitle')}</h1>
        <button className="btn" onClick={() => setCreating(!creating)}>
          + {t('newCustomer')}
        </button>
      </div>

      <div className="card summary">
        <div className="muted small">{t('totalDebt')}</div>
        <div className="grand debt">{money(totalDebt)}</div>
        <div className="muted small">
          {t('debtsTitle')}: {debtors}
        </div>
      </div>

      {creating && (
        <div className="card">
          {error && <div className="notice error">{error}</div>}
          <label>
            {t('customerName')}
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {t('phone')}
            <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 7__ ___ __ __" />
          </label>
          <div className="row">
            <button className="btn grow" onClick={create}>
              {t('save')}
            </button>
            <button className="btn secondary" onClick={() => setCreating(false)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      <input type="search" value={q} placeholder={t('searchCustomer')} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        <button className={!showAll ? 'chip active' : 'chip'} onClick={() => setShowAll(false)}>
          {t('debtsTitle')}
        </button>
        <button className={showAll ? 'chip active' : 'chip'} onClick={() => setShowAll(true)}>
          {t('allClients')}
        </button>
      </div>

      {customers && balances && rows.length === 0 && <p className="muted center">{t('noDebtors')}</p>}

      <ul className="list">
        {rows.map(({ c, bal }) => (
          <li key={c.id}>
            <Link to={`/debts/${c.id}`} className="list-item">
              <div>
                <div className="li-name">{c.name}</div>
                {c.phone && <div className="muted small">{c.phone}</div>}
              </div>
              <div className={bal > 0 ? 'li-price debt' : 'li-price muted'}>{bal > 0 ? money(bal) : '—'}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
