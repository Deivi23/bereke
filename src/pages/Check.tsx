import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { findByBarcode, type Product } from '../db'
import { money, qtyText, useI18n } from '../i18n'
import { beep } from '../feedback'
import Scanner from '../components/Scanner'
import CodeInput from '../components/CodeInput'
import { Camera } from 'lucide-react'

type Result = { code: string; product?: Product } | null

export default function Check() {
  const { t } = useI18n()
  const nav = useNavigate()
  const [camera, setCamera] = useState(false)
  const [result, setResult] = useState<Result>(null)

  const lookup = async (code: string) => {
    const product = await findByBarcode(code)
    if (!product) beep(false)
    setResult({ code, product })
  }

  const p = result?.product
  const markup = p && p.buyPrice > 0 ? Math.round(((p.sellPrice - p.buyPrice) / p.buyPrice) * 100) : null

  return (
    <div className="page">
      <h1>{t('checkTitle')}</h1>

      {camera ? (
        <>
          <Scanner onDetect={lookup} />
          <button className="btn secondary block" onClick={() => setCamera(false)}>
            {t('stopCamera')}
          </button>
        </>
      ) : (
        <button className="btn big block" onClick={() => setCamera(true)}>
          <Camera className="ico" /> {t('startCamera')}
        </button>
      )}

      <div className="gap" />
      <CodeInput onSubmit={lookup} autoFocus={!camera} />

      {!result && camera && <p className="muted center">{t('scanHint')}</p>}

      {result && p && (
        <div className="card result">
          <div className="result-name">{p.name}</div>
          <div className="result-price">
            {money(p.sellPrice)}
            {p.unit === 'kg' && <small> / {t('kg')}</small>}
          </div>
          <div className="result-meta">
            <span>
              {t('inStock')}: <b>{qtyText(p.stock)}</b> {t(p.unit === 'kg' ? 'kg' : 'pcs')}
            </span>
            {p.buyPrice > 0 && (
              <span>
                {t('buyPriceLabel')}: <b>{money(p.buyPrice)}</b>
                {markup !== null && ` · ${t('margin')} ${markup}%`}
              </span>
            )}
            <span className="muted">
              {t('code')}: {result.code}
            </span>
          </div>
          <Link className="btn secondary" to={`/products/${p.id}`}>
            {t('edit')}
          </Link>
        </div>
      )}

      {result && !p && (
        <div className="card result notfound">
          <div className="result-name">{t('notFound')}</div>
          <div className="muted">
            {t('code')}: {result.code}
          </div>
          <button className="btn" onClick={() => nav(`/products/new?barcode=${encodeURIComponent(result.code)}`)}>
            + {t('addProduct')}
          </button>
        </div>
      )}
    </div>
  )
}
