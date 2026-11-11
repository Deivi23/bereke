import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useI18n } from './i18n'
import Sell from './pages/Sell'
import Check from './pages/Check'
import Products from './pages/Products'
import ProductForm from './pages/ProductForm'
import Receive from './pages/Receive'
import Labels from './pages/Labels'
import Debts from './pages/Debts'
import Customer from './pages/Customer'
import More from './pages/More'

export default function App() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? 'tab active' : 'tab')
  // «Ценники» живут внутри «Ещё», но вкладка «Ещё» должна подсвечиваться и на них
  const moreActive = pathname === '/more' || pathname === '/labels'
  return (
    <div className="app">
      <main>
        <Routes>
          <Route path="/" element={<Sell />} />
          <Route path="/check" element={<Check />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductForm />} />
          <Route path="/receive" element={<Receive />} />
          <Route path="/debts" element={<Debts />} />
          <Route path="/debts/:id" element={<Customer />} />
          <Route path="/labels" element={<Labels />} />
          <Route path="/more" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="tabbar">
        <NavLink to="/" end className={tab}>
          <span className="ico">🛒</span>
          {t('navSell')}
        </NavLink>
        <NavLink to="/check" className={tab}>
          <span className="ico">▦</span>
          {t('navCheck')}
        </NavLink>
        <NavLink to="/products" className={tab}>
          <span className="ico">☰</span>
          {t('navProducts')}
        </NavLink>
        <NavLink to="/receive" className={tab}>
          <span className="ico">⇩</span>
          {t('navReceive')}
        </NavLink>
        <NavLink to="/debts" className={tab}>
          <span className="ico">📒</span>
          {t('navDebts')}
        </NavLink>
        <NavLink to="/more" className={() => (moreActive ? 'tab active' : 'tab')}>
          <span className="ico">⚙</span>
          {t('navMore')}
        </NavLink>
      </nav>
    </div>
  )
}
