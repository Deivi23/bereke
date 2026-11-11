import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Customer } from '../db'
import { useBalances } from '../hooks'
import { money, useI18n } from '../i18n'

/** Выбор клиента из списка или быстрое создание нового. */
export default function CustomerPicker({ onSelect }: { onSelect: (c: Customer) => void }) {
  const { t } = useI18n()
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), [])
  const balances = useBalances()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (customers ?? [])
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.phone.includes(needle))
      .slice(0, 30)
  }, [customers, q])

  const create = async () => {
    if (!name.trim()) return setError(t('noName'))
    const c: Customer = { name: name.trim(), phone: phone.trim(), createdAt: Date.now() }
    c.id = await db.customers.add(c)
    onSelect(c)
  }

  if (creating) {
    return (
      <div>
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
    )
  }

  return (
    <div>
      <div className="row">
        <input type="search" value={q} placeholder={t('searchCustomer')} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setCreating(true)}>
          +
        </button>
      </div>
      <ul className="list">
        {shown.map((c) => {
          const bal = balances?.get(c.id!) ?? 0
          return (
            <li key={c.id}>
              <button className="list-item" onClick={() => onSelect(c)}>
                <span>
                  <span className="li-name">{c.name}</span>
                  {c.phone && <span className="muted small"> · {c.phone}</span>}
                </span>
                {bal > 0 && <span className="li-price debt">{money(bal)}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
