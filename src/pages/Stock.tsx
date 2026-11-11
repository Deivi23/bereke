import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ClipboardCheck, ClipboardList, Hourglass, PackagePlus, Percent, Trash2, Truck } from 'lucide-react'
import { db } from '../db'
import { daysUntil } from '../dates'
import { useI18n } from '../i18n'

/** Главная страница склада: переходы к складским операциям, с подсказками, где нужно внимание. */
export default function Stock() {
  const { t } = useI18n()
  const alerts = useLiveQuery(async () => {
    const products = await db.products.toArray()
    return {
      expiring: products.filter((p) => p.stock > 0 && p.expiry !== undefined && daysUntil(p.expiry) <= 7).length,
      low: products.filter((p) => p.minStock > 0 && p.stock <= p.minStock).length,
    }
  }, [])

  const items = [
    { to: '/receive', icon: <PackagePlus className="ico" />, title: t('hubReceive'), hint: t('hubReceiveHint') },
    { to: '/stock/inventory', icon: <ClipboardCheck className="ico" />, title: t('hubInventory'), hint: t('hubInventoryHint') },
    { to: '/stock/writeoff', icon: <Trash2 className="ico" />, title: t('hubWriteoff'), hint: t('hubWriteoffHint') },
    { to: '/stock/expiry', icon: <Hourglass className="ico" />, title: t('hubExpiry'), hint: t('hubExpiryHint'), badge: alerts?.expiring },
    { to: '/stock/order', icon: <ClipboardList className="ico" />, title: t('hubOrder'), hint: t('hubOrderHint'), badge: alerts?.low },
    { to: '/stock/reprice', icon: <Percent className="ico" />, title: t('hubReprice'), hint: t('hubRepriceHint') },
    { to: '/stock/suppliers', icon: <Truck className="ico" />, title: t('hubSuppliers'), hint: t('hubSuppliersHint') },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('stockTitle')}</h1>
      </div>
      <ul className="list menu-list hub">
        {items.map((it) => (
          <li key={it.to}>
            <Link to={it.to}>
              {it.icon}
              <span className="grow">
                <span className="li-name">{it.title}</span>
                <span className="li-sub" style={{ display: 'block' }}>
                  {it.hint}
                </span>
              </span>
              {!!it.badge && <span className="badge warn">{it.badge}</span>}
              <ChevronRight className="ico sm" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
