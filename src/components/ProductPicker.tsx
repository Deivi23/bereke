import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Search } from 'lucide-react'
import { db, findByBarcode, type Product } from '../db'
import { beep } from '../feedback'
import { money, useI18n } from '../i18n'
import Scanner from './Scanner'

/** Выбор товара сканером, штрихкодом или по названию. Для списаний и инвентаризации. */
export default function ProductPicker({ onPick }: { onPick: (p: Product) => void }) {
  const { t } = useI18n()
  const [camera, setCamera] = useState(false)
  const [q, setQ] = useState('')
  const [missing, setMissing] = useState('')

  const matches = useLiveQuery(async () => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2 || /^\d+$/.test(needle)) return []
    return db.products.filter((p) => p.name.toLowerCase().includes(needle)).limit(8).toArray()
  }, [q])

  const byCode = async (code: string, sound: boolean) => {
    const p = await findByBarcode(code)
    if (p) {
      if (sound) beep(true)
      setMissing('')
      onPick(p)
    } else {
      beep(false)
      setMissing(code)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = q.trim()
    if (!v) return
    if (/^\d{4,}$/.test(v)) {
      byCode(v, true)
      setQ('')
    } else if (matches && matches.length > 0) {
      onPick(matches[0])
      setQ('')
    }
  }

  return (
    <div>
      <div className="reg-top">
        <form className="searchbar" onSubmit={submit}>
          <Search className="ico" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('regSearch')} autoComplete="off" />
        </form>
        <button className={camera ? 'btn' : 'btn secondary'} onClick={() => setCamera(!camera)} aria-label={t('showCamera')}>
          <Camera className="ico" />
        </button>
      </div>
      {camera && <Scanner onDetect={(c) => byCode(c, false)} cooldownMs={1500} />}
      {missing && (
        <div className="notice error">
          {t('notFound')}: {missing}
          <Link to={`/products/new?barcode=${encodeURIComponent(missing)}`} className="grow" style={{ textAlign: 'right' }}>
            + {t('addProduct')}
          </Link>
        </div>
      )}
      {(matches?.length ?? 0) > 0 && (
        <ul className="list">
          {matches!.map((p) => (
            <li key={p.id}>
              <button
                className="list-item"
                onClick={() => {
                  onPick(p)
                  setQ('')
                }}
              >
                <span className="li-name">{p.name}</span>
                <span className="li-price">{money(p.sellPrice)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
