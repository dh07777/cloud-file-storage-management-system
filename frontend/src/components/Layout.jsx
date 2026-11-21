import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity, BarChart3, Bell, FolderOpen, FolderTree, HardDrive, HelpCircle, LayoutDashboard, LogOut, Menu, Moon,
  Search, Settings, Share2, ShieldCheck, Star, Sun, Trash2, Users, UserCog, Clock, Inbox, X, Vault,
} from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../context/Auth'
import { useTheme } from '../context/Theme'
import { cn } from '../utils'
import { UploadProvider } from './UploadManager'
import { Avatar, StorageBar } from './ui'

export function Logo({ className = '' }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2 font-display text-xl font-bold', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-fg"><Vault size={18} /></span>CloudVault
    </Link>
  )
}

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/files', label: 'My Files', icon: FolderOpen },
  { to: '/app/folders', label: 'My Folders', icon: FolderTree },
  { to: '/app/recent', label: 'Recent', icon: Clock },
  { to: '/app/shared-with-me', label: 'Shared with me', icon: Inbox },
  { to: '/app/shared-by-me', label: 'Shared by me', icon: Share2 },
  { to: '/app/favorites', label: 'Favorites', icon: Star },
  { to: '/app/trash', label: 'Trash', icon: Trash2 },
  { to: '/app/storage', label: 'Storage', icon: BarChart3 },
]
const ADMIN_NAV = [
  { to: '/app/admin', label: 'Admin dashboard', icon: ShieldCheck, end: true },
  { to: '/app/admin/users', label: 'User management', icon: UserCog },
  { to: '/app/admin/storage', label: 'Storage management', icon: HardDrive },
  { to: '/app/admin/activity', label: 'Activity logs', icon: Activity },
]

function NavItem({ item, onClick }) {
  return (
    <NavLink to={item.to} end={item.end} onClick={onClick}
      className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition',
        isActive ? 'bg-brand/15 text-brand' : 'text-muted hover:bg-sunk hover:text-ink')}>
      <item.icon size={18} />{item.label}
    </NavLink>
  )
}

export default function Layout() {
  const { user, usage, logout, isAdmin } = useAuth()
  const { toggle, isDark } = useTheme()
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)

  useEffect(() => { setOpen(false); setMenu(false) }, [loc.pathname])
  useEffect(() => {
    let alive = true
    const tick = () => api.get('/notifications/unread-count').then((r) => alive && setUnread(r.data.unread)).catch(() => {})
    tick()
    const t = setInterval(tick, 30000)
    window.addEventListener('cv:notifications', tick)
    return () => { alive = false; clearInterval(t); window.removeEventListener('cv:notifications', tick) }
  }, [loc.pathname])

  const submit = (e) => { e.preventDefault(); if (q.trim()) nav(`/app/search?q=${encodeURIComponent(q.trim())}`) }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4"><Logo />
        <button className="btn-quiet !p-1.5 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3" aria-label="Main">
        {NAV.map((n) => <NavItem key={n.to} item={n} />)}
        {isAdmin && <>
          <p className="px-3 pb-1 pt-5 text-xs font-semibold text-muted">Administration</p>
          {ADMIN_NAV.map((n) => <NavItem key={n.to} item={n} />)}</>}
        <p className="px-3 pb-1 pt-5 text-xs font-semibold text-muted">More</p>
        <NavItem item={{ to: '/app/notifications', label: 'Notifications', icon: Bell }} />
        <NavItem item={{ to: '/app/settings', label: 'Settings', icon: Settings }} />
        <NavItem item={{ to: '/app/help', label: 'Help & support', icon: HelpCircle }} />
      </nav>
      {usage && <div className="border-t border-line p-4"><StorageBar used={usage.used} quota={usage.quota} compact /></div>}
    </div>
  )

  return (
    <UploadProvider>
      <div className="flex h-full">
        <aside className="hidden w-64 shrink-0 border-r border-line bg-panel lg:block">{sidebar}</aside>
        {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="pop absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-panel shadow-xl">{sidebar}</aside></div>}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
            <button className="btn-quiet !p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
            <form onSubmit={submit} className="relative max-w-xl flex-1" role="search">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input !pl-9" placeholder="Search files and folders..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            </form>
            <div className="ml-auto flex items-center gap-1">
              <button className="btn-quiet !p-2" onClick={toggle} aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>
              <Link to="/app/notifications" className="btn-quiet relative !p-2" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
                <Bell size={18} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
              </Link>
              <div className="relative">
                <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-lg p-1 hover:bg-sunk" aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu">
                  <Avatar user={user} size={32} /></button>
                {menu && <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                  <div className="pop card absolute right-0 z-40 mt-2 w-60 overflow-hidden text-sm" role="menu">
                    <div className="border-b border-line px-4 py-3"><p className="truncate font-bold">{user?.full_name || user?.username}</p>
                      <p className="truncate text-xs text-muted">{user?.email}</p><span className="chip mt-1.5">{user?.role_label}</span></div>
                    <Link role="menuitem" to="/app/settings" className="flex items-center gap-2 px-4 py-2.5 hover:bg-sunk"><Settings size={16} />Settings</Link>
                    <Link role="menuitem" to="/app/help" className="flex items-center gap-2 px-4 py-2.5 hover:bg-sunk"><HelpCircle size={16} />Help & support</Link>
                    <button role="menuitem" onClick={async () => { await logout(); nav('/login') }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-danger hover:bg-sunk"><LogOut size={16} />Sign out</button>
                  </div></>}
              </div>
            </div>
          </header>
          {user && !user.email_verified && <VerifyBanner />}
          <main className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-7xl p-4 sm:p-6"><Outlet /></div></main>
        </div>
      </div>
    </UploadProvider>
  )
}

function VerifyBanner() {
  const [sent, setSent] = useState(false)
  const [link, setLink] = useState(null)
  const send = async () => {
    try { const { data } = await api.post('/auth/resend-verification'); setSent(true); setLink(data.dev_verify_link || null) } catch { /* rate limited */ }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warn/30 bg-warn/10 px-4 py-2 text-sm">
      <span>Please verify your email address to secure your account.</span>
      {sent ? (link ? <a className="font-semibold text-brand underline" href={link}>Verify now (dev link)</a> : <span className="text-muted">Email sent - check your inbox.</span>)
        : <button className="font-semibold text-brand underline" onClick={send}>Resend verification email</button>}
    </div>
  )
}
