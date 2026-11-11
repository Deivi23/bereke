import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { db, deleteProduct, findByBarcode, newProduct, saveProduct, type Product, type Unit } from '../db'
import { generateInternalCode } from '../barcode'
import { money, useI18n } from '../i18n'
import Scanner from '../components/Scanner'
import { Camera, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { parseDate, toInputDate } from '../dates'

export const num = (s: string): number => {
  const v = parseFloat(s.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(v) ? v : 0
}

export default function ProductForm() {
  const { t } = useI18n()
  const nav = useNavigate()
  const { id } = useParams()
  const [search] = useSearchParams()
  const isNew = id === 'new'

  const [loaded, setLoaded] = useState(isNew)
  const [base, setBase] = useState<Product>(() =>
    newProduct({ barcodes: search.get('barcode') ? [search.get('barcode')!] : [] }),
  )
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState<Unit>('pcs')
  const [buy, setBuy] = useState('')
  const [sell, setSell] = useState('')
  const [stock, setStock] = useState('')
  const [minStock, setMinStock] = useState('')
  const [quick, setQuick] = useState(false)
  const [expiry, setExpiry] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const suppliers = useLiveQuery(() => db.suppliers.orderBy('name').toArray(), []) ?? []
  const [codes, setCodes] = useState<string[]>(base.barcodes)
  const [newCode, setNewCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<string[]>([])

  useEffect(() => {
    db.products.orderBy('category').uniqueKeys().then((k) => setCategories((k as string[]).filter(Boolean)))
  }, [])

  useEffect(() => {
    if (isNew) return
    db.products.get(id!).then((p) => {
      if (!p) return nav('/products', { replace: true })
      setBase(p)
      setName(p.name)
      setCategory(p.category)
      setUnit(p.unit)
      setBuy(p.buyPrice ? String(p.buyPrice) : '')
      setSell(p.sellPrice ? String(p.sellPrice) : '')
      setStock(String(p.stock))
      setMinStock(p.minStock ? String(p.minStock) : '')
      setQuick(!!p.quick)
      setExpiry(toInputDate(p.expiry))
      setSupplierId(p.supplierId ?? '')
      setCodes(p.barcodes)
      setLoaded(true)
    })
  }, [id, isNew, nav])

  const addCode = async (raw: string) => {
    const code = raw.trim()
    if (!code) return
    const other = await findByBarcode(code)
    if (other && other.id !== base.id) {
      setError(`${t('codeExists')} ${other.name}`)
      return
    }
    setError('')
    setCodes((c) => (c.includes(code) ? c : [...c, code]))
    setNewCode('')
  }

  const makeCode = async () => {
    for (let i = 0; i < 20; i++) {
      const code = generateInternalCode(new Set(codes))
      if (!(await findByBarcode(code))) {
        setCodes((c) => [...c, code])
        return
      }
    }
  }

  const save = async () => {
    if (!name.trim()) return setError(t('nameRequired'))
    for (const c of codes) {
      const other = await findByBarcode(c)
      if (other && other.id !== base.id) return setError(`${t('codeExists')} ${other.name}`)
    }
    await saveProduct({
      ...base,
      name: name.trim(),
      category: category.trim(),
      unit,
      buyPrice: num(buy),
      sellPrice: num(sell),
      stock: num(stock),
      minStock: num(minStock),
      barcodes: codes,
      quick,
      expiry: parseDate(expiry),
      supplierId: supplierId || undefined,
    })
    nav('/products', { replace: true })
  }

  const remove = async () => {
    if (isNew || !confirm(t('confirmDelete'))) return
    await deleteProduct(base.id)
    nav('/products', { replace: true })
  }

  if (!loaded) return null
  const b = num(buy)
  const s = num(sell)
  const markup = b > 0 && s > 0 ? Math.round(((s - b) / b) * 100) : null

  return (
    <div className="page">
      <h1>{isNew ? t('newProduct') : t('editProduct')}</h1>
      {error && <div className="notice error">{error}</div>}

      <label>
        {t('name')}
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} />
      </label>

      <label>
        {t('category')}
        <input value={category} onChange={(e) => setCategory(e.target.value)} list="cats" />
        <datalist id="cats">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <div className="field">
        <span className="field-label">{t('barcodes')}</span>
        {codes.map((c) => (
          <div className="code-row" key={c}>
            <code>{c}</code>
            <button className="link" onClick={() => setCodes(codes.filter((x) => x !== c))}>
              <X className="ico sm" />
            </button>
          </div>
        ))}
        <div className="row">
          <input
            value={newCode}
            inputMode="numeric"
            placeholder={t('addBarcode')}
            onChange={(e) => setNewCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCode(newCode))}
          />
          <button className="btn secondary" onClick={() => addCode(newCode)}>
            +
          </button>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={() => setScanning(!scanning)}>
            <Camera className="ico" /> {t('scanBarcode')}
          </button>
          <button className="btn secondary" onClick={makeCode}>
            {t('generateCode')}
          </button>
        </div>
        <p className="muted small">{t('generateHint')}</p>
        {scanning && (
          <Scanner
            onDetect={(c) => {
              addCode(c)
              setScanning(false)
            }}
          />
        )}
      </div>

      <label>
        {t('unit')}
        <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
          <option value="pcs">{t('unitPcs')}</option>
          <option value="kg">{t('unitKg')}</option>
        </select>
      </label>

      <div className="grid2">
        <label>
          {t('buyPrice')}, ₸
          <input inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} />
        </label>
        <label>
          {t('sellPrice')}, ₸
          <input inputMode="decimal" value={sell} onChange={(e) => setSell(e.target.value)} />
        </label>
      </div>
      {markup !== null && (
        <p className="muted small">
          {t('margin')}: {markup}% · +{money(s - b)}
        </p>
      )}

      <div className="grid2">
        <label>
          {t('stock')}
          <input inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} />
        </label>
        <label>
          {t('minStock')}
          <input inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
        </label>
      </div>

      <div className="grid2">
        <label>
          {t('expiryLabel')}
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </label>
        <label>
          {t('mainSupplier')}
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">{t('noSupplier')}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="check">
        <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} />
        {t('quickButton')}
      </label>

      <div className="row">
        <button className="btn grow" onClick={save}>
          {t('save')}
        </button>
        <button className="btn secondary" onClick={() => nav(-1)}>
          {t('cancel')}
        </button>
      </div>
      {!isNew && (
        <button className="btn danger block" onClick={remove}>
          {t('delete')}
        </button>
      )}
    </div>
  )
}
