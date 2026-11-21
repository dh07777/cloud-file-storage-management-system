import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const ThemeCtx = createContext(null)
export const useTheme = () => useContext(ThemeCtx)

function apply(pref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  return dark
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('cv_theme') || 'system')
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    setIsDark(apply(theme))
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = () => setIsDark(apply('system'))
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [theme])
  const setTheme = useCallback((t) => { localStorage.setItem('cv_theme', t); setThemeState(t) }, [])
  const toggle = useCallback(() => setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'), [setTheme])
  return <ThemeCtx.Provider value={{ theme, setTheme, toggle, isDark }}>{children}</ThemeCtx.Provider>
}
