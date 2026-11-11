import { Link } from 'react-router-dom'
import { BarChart3, ChevronRight, Clock, History, ScanBarcode, Settings, Tags } from 'lucide-react'
import { useI18n } from '../i18n'
import SyncBadge from '../components/SyncBadge'

/** Меню «Ещё» для телефона: всё, что не поместилось в нижнюю панель. */
export default function More() {
  const { t } = useI18n()
  const items = [
    { to: '/analytics', icon: <BarChart3 className="ico" />, label: t('navAnalytics') },
    { to: '/shift', icon: <Clock className="ico" />, label: t('navShift') },
    { to: '/sales', icon: <History className="ico" />, label: t('navSales') },
    { to: '/labels', icon: <Tags className="ico" />, label: t('navLabels') },
    { to: '/check', icon: <ScanBarcode className="ico" />, label: t('navPriceCheck') },
    { to: '/settings', icon: <Settings className="ico" />, label: t('navSettings') },
  ]
  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('moreTitle2')}</h1>
      </div>
      <SyncBadge />
      <ul className="list menu-list">
        {items.map((it) => (
          <li key={it.to}>
            <Link to={it.to}>
              {it.icon}
              {it.label}
              <ChevronRight className="ico sm" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
