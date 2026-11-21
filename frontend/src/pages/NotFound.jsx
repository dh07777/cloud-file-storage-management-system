import { Link } from 'react-router-dom'
import PublicShell from '../components/PublicShell'

export default function NotFound() {
  return (
    <PublicShell narrow>
      <div className="py-16 text-center">
        <p className="font-display text-7xl font-bold text-brand">404</p>
        <h1 className="mt-2 text-2xl font-bold">Nothing in this vault</h1>
        <p className="mt-2 text-muted">The page you are looking for does not exist or was moved.</p>
        <Link to="/" className="btn-primary mt-6">Back to home</Link>
      </div>
    </PublicShell>
  )
}
