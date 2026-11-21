import { Link } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useAuth } from '../context/Auth'
import { useTheme } from '../context/Theme'
import { Logo } from './Layout'

export default function PublicShell({ children, narrow = false }) {
  const { user } = useAuth()
  const { toggle, isDark } = useTheme()
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Logo />
          <nav className="ml-6 hidden gap-5 text-sm font-semibold text-muted sm:flex" aria-label="Site">
            <Link className="hover:text-ink" to="/about">About</Link><Link className="hover:text-ink" to="/help">Help</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn-quiet !p-2" onClick={toggle} aria-label="Toggle theme">{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>
            {user ? <Link className="btn-primary" to="/app">Open dashboard</Link> : <>
              <Link className="btn-ghost" to="/login">Sign in</Link><Link className="btn-primary hidden sm:inline-flex" to="/register">Get started</Link></>}
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-10 ${narrow ? 'max-w-md' : 'max-w-6xl'}`}>{children}</main>
      <footer className="border-t border-line py-6 text-center text-xs text-muted">CloudVault - secure cloud file storage. Built with Flask and React.</footer>
    </div>
  )
}
