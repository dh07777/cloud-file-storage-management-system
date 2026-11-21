import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, session } from '../api'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [usage, setUsage] = useState(null)
  const [limits, setLimits] = useState(null)
  const [loading, setLoading] = useState(!!session.access)

  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/auth/me')
    setUser(data.user)
    setUsage(data.usage)
    setLimits(data.limits)
    return data
  }, [])

  useEffect(() => {
    if (!session.access) return
    refreshUser().catch(() => session.clear()).finally(() => setLoading(false))
  }, [refreshUser])

  useEffect(() => {
    const h = () => { setUser(null); setUsage(null) }
    window.addEventListener('cv:logout', h)
    return () => window.removeEventListener('cv:logout', h)
  }, [])

  const login = async (identifier, password) => {
    const { data } = await api.post('/auth/login', { identifier, password }, { noAuth: true })
    session.set(data.access_token, data.refresh_token)
    setUser(data.user)
    refreshUser().catch(() => {})
    return data.user
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch { /* already invalid */ }
    session.clear()
    setUser(null)
    setUsage(null)
  }

  return (
    <AuthCtx.Provider value={{ user, usage, limits, loading, login, logout, refreshUser, setUser, isAdmin: ['admin', 'super_admin'].includes(user?.role) }}>
      {children}
    </AuthCtx.Provider>
  )
}
