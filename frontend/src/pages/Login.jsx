import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api, errMsg } from '../api'
import PublicShell from '../components/PublicShell'
import { Field, Spinner } from '../components/ui'
import { useAuth } from '../context/Auth'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [f, setF] = useState({ identifier: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await login(f.identifier, f.password); nav(loc.state?.from || '/app', { replace: true }) }
    catch (e2) { setErr(errMsg(e2)) } finally { setBusy(false) }
  }
  return (
    <PublicShell narrow>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to open your vault.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email or username" htmlFor="identifier"><input id="identifier" className="input" autoComplete="username" required value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} /></Field>
          <Field label="Password" htmlFor="password"><input id="password" type="password" className="input" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner size={16} />}Sign in</button>
        </form>
        <div className="mt-4 flex justify-between text-sm"><Link className="text-brand hover:underline" to="/forgot-password">Forgot password?</Link><Link className="text-brand hover:underline" to="/register">Create account</Link></div>
      </div>
      <div className="card mt-4 p-4 text-xs text-muted">
        <p className="mb-1 font-bold text-ink">Demo accounts (after running the seed script)</p>
        <p>alice@example.com / Alice@12345 - user with sample files</p><p>admin@cloudvault.local / Admin@12345 - super admin</p>
      </div>
    </PublicShell>
  )
}
