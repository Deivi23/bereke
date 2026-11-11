import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Phone, Plus, Trash2, Truck } from 'lucide-react'
import { db, deleteSupplier, saveSupplier, type Supplier } from '../db'
import { useI18n } from '../i18n'

export default function Suppliers() {
  const { t } = useI18n()
  const list = useLiveQuery(() => db.suppliers.orderBy('name').toArray(), [])
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>()
    await db.products.each((p) => p.supplierId && m.set(p.supplierId, (m.get(p.supplierId) ?? 0) + 1))
    return m
  }, [])
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null)

  const save = async () => {
    if (!editing?.name?.trim()) return
    await saveSupplier({ id: editing.id, name: editing.name, phone: editing.phone, note: editing.note })
    setEditing(null)
  }

  return (
    <div className="page">
      <Link to="/stock" className="back">
        <ArrowLeft className="ico sm" /> {t('stockTitle')}
      </Link>
      <div className="page-head">
        <h1>{t('suppliersTitle')}</h1>
        <button className="btn" onClick={() => setEditing({ name: '', phone: '', note: '' })}>
          <Plus className="ico" /> {t('newSupplier')}
        </button>
      </div>

      {editing && (
        <div className="card">
          <label>
            {t('name')}
            <input autoFocus value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <label>
            {t('phone')}
            <input type="tel" inputMode="tel" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
          </label>
          <label>
            {t('note')}
            <input value={editing.note ?? ''} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
          </label>
          <div className="row">
            <button className="btn grow" onClick={save}>
              {t('save')}
            </button>
            {editing.id && (
              <button
                className="btn danger"
                onClick={async () => {
                  if (confirm(t('confirmDeleteSupplier'))) {
                    await deleteSupplier(editing.id!)
                    setEditing(null)
                  }
                }}
                aria-label={t('delete')}
              >
                <Trash2 className="ico" />
              </button>
            )}
            <button className="btn secondary" onClick={() => setEditing(null)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {list && list.length === 0 && !editing && (
        <div className="empty">
          <Truck className="ico" />
          <b>{t('suppliersTitle')}</b>
          {t('noSuppliers')}
        </div>
      )}

      <ul className="list">
        {list?.map((s) => (
          <li key={s.id}>
            <div className="list-item">
              <button className="link grow" style={{ textAlign: 'left', padding: 0, display: 'block' }} onClick={() => setEditing(s)}>
                <div className="li-name">{s.name}</div>
                <div className="li-sub">
                  {s.phone && `${s.phone} · `}
                  {t('supplierProducts')}: {counts?.get(s.id) ?? 0}
                  {s.note && ` · ${s.note}`}
                </div>
              </button>
              {s.phone && (
                <a className="btn secondary icon" href={`tel:${s.phone}`} aria-label={t('call')}>
                  <Phone className="ico" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
