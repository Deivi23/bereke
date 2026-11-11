import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addLedger, balanceOf, db, deleteCustomer, updateCustomer } from '../db'
import { fmtDate, money, useI18n } from '../i18n'
import { num } from './ProductForm'

/** Телефон в формате для ссылки WhatsApp (Казахстан: +7). */
function waNumber(phone: string): string {
  let d = phone.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1)
  if (d.length === 10) d = '7' + d
  return d
}

type Panel = null | 'pay' | 'debt' | 'edit'

export default function Customer() {
  const { t } = useI18n()
  const nav = useNavigate()
  const id = useParams().id!
  const customer = useLiveQuery(() => db.customers.get(id), [id])
  const entries = useLiveQuery(() => db.ledger.where('customerId').equals(id).toArray(), [id])
  const [panel, setPanel] = useState<Panel>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    if (customer) {
      setName(customer.name)
      setPhone(customer.phone)
    }
  }, [customer])

  if (!customer || !entries) return null

  const balance = balanceOf(entries)
  const sorted = [...entries].sort((a, b) => b.date - a.date || 0)
  const wa = waNumber(customer.phone)
  const reminder = t('reminderText').replace('{name}', customer.name).replace('{amount}', money(balance))

  const open = (p: Panel) => {
    setPanel(panel === p ? null : p)
    setAmount(p === 'pay' && balance > 0 ? String(balance) : '')
    setNote('')
  }

  const submit = async () => {
    const v = num(amount)
    if (v <= 0) return
    if (panel === 'pay') await addLedger(id, 'payment', v, note)
    if (panel === 'debt') await addLedger(id, 'debt', v, note || t('oldDebtNote'))
    setPanel(null)
    setAmount('')
  }

  const saveEdit = async () => {
    if (!name.trim()) return
    await updateCustomer(id, { name, phone })
    setPanel(null)
  }

  const remove = async () => {
    if (!confirm(t('confirmDeleteCustomer'))) return
    await deleteCustomer(id)
    nav('/debts', { replace: true })
  }

  return (
    <div className="page">
      <Link to="/debts" className="muted small">
        ← {t('debtsTitle')}
      </Link>
      <h1>{customer.name}</h1>
      {customer.phone && <div className="muted">{customer.phone}</div>}

      <div className="card summary">
        <div className="muted small">{t('balance')}</div>
        <div className={balance > 0 ? 'grand debt' : 'grand'}>{balance > 0 ? money(balance) : t('repaid')}</div>
      </div>

      <div className="grid2">
        <button className="btn big" onClick={() => open('pay')}>
          {t('takePayment')}
        </button>
        <button className="btn big secondary" onClick={() => open('debt')}>
          {t('addDebt')}
        </button>
      </div>

      {(panel === 'pay' || panel === 'debt') && (
        <div className="card">
          <label>
            {t('amount')}, ₸
            <input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          {panel === 'pay' && balance > 0 && (
            <button className="link small" onClick={() => setAmount(String(balance))}>
              {t('fullAmount')}: {money(balance)}
            </button>
          )}
          <label>
            {t('note')}
            <input
              value={note}
              placeholder={panel === 'debt' ? t('oldDebtNote') : ''}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="row">
            <button className="btn grow" onClick={submit}>
              {t('save')}
            </button>
            <button className="btn secondary" onClick={() => setPanel(null)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {balance > 0 && wa && (
        <div className="grid2 mt">
          <a className="btn secondary" href={`https://wa.me/${wa}?text=${encodeURIComponent(reminder)}`} target="_blank" rel="noreferrer">
            💬 {t('remind')}
          </a>
          <a className="btn secondary" href={`tel:+${wa}`}>
            📞 {t('call')}
          </a>
        </div>
      )}

      <h2>{t('historyLabel')}</h2>
      {sorted.length === 0 && <p className="muted">{t('noHistory')}</p>}
      <ul className="list">
        {sorted.map((e) => (
          <li key={e.id} className="list-item static">
            <div>
              <div className="li-name">{e.type === 'debt' ? t('debtEntry') : t('paymentEntry')}</div>
              <div className="muted small">
                {fmtDate(e.date)}
                {e.note && ` · ${e.note}`}
              </div>
            </div>
            <div className={e.type === 'debt' ? 'li-price debt' : 'li-price paid'}>
              {e.type === 'debt' ? '+' : '−'}
              {money(e.amount)}
            </div>
          </li>
        ))}
      </ul>

      <div className="row mt">
        <button className="btn secondary grow" onClick={() => open('edit')}>
          {t('editCustomer')}
        </button>
      </div>
      {panel === 'edit' && (
        <div className="card">
          <label>
            {t('customerName')}
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {t('phone')}
            <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn grow" onClick={saveEdit}>
              {t('save')}
            </button>
            <button className="btn secondary" onClick={() => setPanel(null)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
      <button className="btn danger block" onClick={remove}>
        {t('deleteCustomer')}
      </button>
    </div>
  )
}
