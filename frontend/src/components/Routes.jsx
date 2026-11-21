import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/Auth'
import { Spinner } from './ui'

export function ProtectedRoute({ adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="grid h-full place-items-center"><Spinner size={28} /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  if (adminOnly && !isAdmin) return <Navigate to="/app" replace />
  return <Outlet />
}

export function GuestRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="grid h-full place-items-center"><Spinner size={28} /></div>
  return user ? <Navigate to="/app" replace /> : <Outlet />
}
