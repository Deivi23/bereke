import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useI18n } from './i18n'
import Check from './pages/Check'
import Products from './pages/Products'
import ProductForm from './pages/ProductForm'
import Receive from './pages/Receive'
import Labels from './pages/Labels'
import More from './pages/More'

export default function App() {
  const { t } = useI18n()
  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? 'tab active' : 'tab')
  return (
    <div className="app">
      <main>
        <Routes>
          <Route path="/" element={<Check />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductForm />} />
          <Route path="/receive" element={<Receive />} />
          <Route path="/labels" element={<Labels />} />
          <Route path="/more" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="tabbar">
        <NavLink to="/" end className={tab}>
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
        <NavLink to="/labels" className={tab}>
          <span className="ico">🏷</span>
          {t('navLabels')}
        </NavLink>
        <NavLink to="/more" className={tab}>
          <span className="ico">⚙</span>
          {t('navMore')}
        </NavLink>
      </nav>
    </div>
  )
}
