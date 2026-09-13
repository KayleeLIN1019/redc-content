import { useEffect, useState } from 'react'
import { Images, LayoutDashboard, Menu, Package, PenLine, Settings, X } from 'lucide-react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'

import AssemblePage from './AssemblePage'
import AssetsPage from './AssetsPage'
import DashboardPage from './DashboardPage'
import RewritePage from './RewritePage'
import SettingsPage from './SettingsPage'
import { cx } from './ui'

const navItems = [
  { to: '/', label: '素材库', icon: Images, end: true },
  { to: '/rewrite', label: '竞品改写', icon: PenLine },
  { to: '/assemble', label: '内容打包', icon: Package },
  { to: '/dashboard', label: '数据看板', icon: LayoutDashboard },
] as const

function sideLink(isActive: boolean): string {
  return cx(
    'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-200',
    isActive
      ? 'bg-cta text-cta-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  )
}

function App() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const nav = (
    <>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3" aria-label="主导航">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={'end' in item} className={({ isActive }) => sideLink(isActive)}>
            <item.icon size={18} strokeWidth={1.75} aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-border p-3">
        <NavLink to="/settings" className={({ isActive }) => sideLink(isActive)}>
          <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
          设置
        </NavLink>
      </div>
    </>
  )

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <aside className="glass-strong hidden h-full w-56 shrink-0 flex-col border-r border-border md:flex">
        <div className="px-5 py-5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-cta">Redc</p>
          <p className="mt-1 text-sm font-semibold leading-snug">内容生产控制台</p>
        </div>
        {nav}
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 cursor-pointer bg-black/55"
            aria-label="关闭菜单"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="glass-strong relative flex h-full w-64 max-w-[82vw] flex-col shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-cta">Redc</p>
                <p className="mt-1 text-sm font-semibold">内容生产控制台</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary px-2 py-2"
                aria-label="关闭菜单"
                onClick={() => setMenuOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
          <button
            type="button"
            className="btn btn-secondary px-2 py-2"
            aria-label="打开菜单"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-cta">Redc</p>
            <p className="text-sm font-semibold">内容生产控制台</p>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto px-4 py-6 md:px-6 md:py-8">
          <div className="mx-auto max-w-[92rem]">
            <Routes>
              <Route path="/" element={<AssetsPage />} />
              <Route path="/rewrite" element={<RewritePage />} />
              <Route path="/assemble" element={<AssemblePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
