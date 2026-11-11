import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  BookOpen,
  Boxes,
  Clock,
  Ellipsis,
  History,
  PackagePlus,
  ScanBarcode,
  Settings as SettingsIcon,
  ShoppingCart,
  Tags,
} from 'lucide-react'
import { useI18n } from './i18n'
import Register from './pages/Register'
import Check from './pages/Check'
import Products from './pages/Products'
import ProductForm from './pages/ProductForm'
import Receive from './pages/Receive'
import Labels from './pages/Labels'
import Debts from './pages/Debts'
import Customer from './pages/Customer'
import More from './pages/More'
import Settings from './pages/Settings'
import Sales from './pages/Sales'
import SaleDetail from './pages/SaleDetail'
import Shift from './pages/Shift'
import SyncBadge from './components/SyncBadge'

function Logo() {
  // Шаңырақ — купол юрты: круг с перекрестьем
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#36aac5" />
      <circle cx="24" cy="24" r="12" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M24 12v24M12 24h24" stroke="#fff" strokeWidth="3" />
      <circle cx="24" cy="24" r="4" fill="#e8b100" />
    </svg>
  )
}

export default function App() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const moreActive = ['/more', '/labels', '/sales', '/shift', '/check', '/settings'].some((p) => pathname.startsWith(p))

  const side = ({ isActive }: { isActive: boolean }) => (isActive ? 'side-link active' : 'side-link')
  const bottom = ({ isActive }: { isActive: boolean }) => (isActive ? 'bn active' : 'bn')

  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="brand">
          <Logo /> {t('appName')}
        </div>
        <nav className="side-nav">
          <NavLink to="/" end className={side}>
            <ShoppingCart className="ico" /> {t('navSell')}
          </NavLink>
          <NavLink to="/products" className={side}>
            <Boxes className="ico" /> {t('navProducts')}
          </NavLink>
          <NavLink to="/receive" className={side}>
            <PackagePlus className="ico" /> {t('navReceive')}
          </NavLink>
          <NavLink to="/debts" className={side}>
            <BookOpen className="ico" /> {t('navDebts')}
          </NavLink>
          <div className="side-sep" />
          <NavLink to="/sales" className={side}>
            <History className="ico" /> {t('navSales')}
          </NavLink>
          <NavLink to="/shift" className={side}>
            <Clock className="ico" /> {t('navShift')}
          </NavLink>
          <NavLink to="/labels" className={side}>
            <Tags className="ico" /> {t('navLabels')}
          </NavLink>
          <NavLink to="/check" className={side}>
            <ScanBarcode className="ico" /> {t('navPriceCheck')}
          </NavLink>
        </nav>
        <div className="side-foot">
          <SyncBadge />
          <NavLink to="/settings" className={side}>
            <SettingsIcon className="ico" /> {t('navSettings')}
          </NavLink>
        </div>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<Register />} />
          <Route path="/check" element={<Check />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductForm />} />
          <Route path="/receive" element={<Receive />} />
          <Route path="/debts" element={<Debts />} />
          <Route path="/debts/:id" element={<Customer />} />
          <Route path="/labels" element={<Labels />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/sales/:id" element={<SaleDetail />} />
          <Route path="/shift" element={<Shift />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/more" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="bottomnav no-print">
        <NavLink to="/" end className={bottom}>
          <ShoppingCart className="ico" /> {t('navSell')}
        </NavLink>
        <NavLink to="/products" className={bottom}>
          <Boxes className="ico" /> {t('navProducts')}
        </NavLink>
        <NavLink to="/receive" className={bottom}>
          <PackagePlus className="ico" /> {t('navReceive')}
        </NavLink>
        <NavLink to="/debts" className={bottom}>
          <BookOpen className="ico" /> {t('navDebts')}
        </NavLink>
        <NavLink to="/more" className={() => (moreActive ? 'bn active' : 'bn')}>
          <Ellipsis className="ico" /> {t('moreTitle2')}
        </NavLink>
      </nav>
    </div>
  )
}
