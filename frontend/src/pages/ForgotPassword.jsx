import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { api, errMsg } from '../api'
import PublicShell from '../components/PublicShell'
import { Field, Spinner } from '../components/ui'
import { useAuth } from '../context/Auth'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { setRes((await api.post('/auth/forgot-password', { email }, { noAuth: true })).data) } catch (e2) { setErr(errMsg(e2)) } finally { setBusy(false) }
  }
  return (
    <PublicShell narrow>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Forgot your password?</h1>
        {res ? (
          <div className="mt-4 space-y-3 text-sm"><p>{res.message}</p>
            {res.dev_reset_link && <p className="rounded-lg bg-sunk p-3 text-xs">Development mode: <a className="font-semibold text-brand underline" href={res.dev_reset_link}>open reset link</a></p>}
            <Link className="btn-ghost" to="/login">Back to sign in</Link></div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <p className="text-sm text-muted">Enter your email and we will send you a link to choose a new password.</p>
            <Field label="Email" htmlFor="fp-email"><input id="fp-email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner size={16} />}Send reset link</button>
            <p className="text-center text-sm"><Link className="text-brand hover:underline" to="/login">Back to sign in</Link></p>
          </form>)}
      </div>
    </PublicShell>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [f, setF] = useState({ password: '', confirm: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (f.password !== f.confirm) return setErr('Passwords do not match')
    setBusy(true)
    try { await api.post('/auth/reset-password', { token: params.get('token'), password: f.password }, { noAuth: true }); setOk(true); setTimeout(() => nav('/login'), 1800) }
    catch (e2) { setErr(errMsg(e2)) } finally { setBusy(false) }
  }
  return (
    <PublicShell narrow>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        {ok ? <p className="mt-4 flex items-center gap-2 text-ok"><CheckCircle2 size={18} />Password updated - redirecting to sign in...</p> : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="New password" htmlFor="np" hint="At least 8 characters with letters and numbers"><input id="np" type="password" className="input" autoComplete="new-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            <Field label="Confirm password" htmlFor="npc"><input id="npc" type="password" className="input" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <button className="btn-primary w-full" disabled={busy || !params.get('token')}>{busy && <Spinner size={16} />}Update password</button>
          </form>)}
      </div>
    </PublicShell>
  )
}

export function VerifyEmail() {
  const [params] = useSearchParams()
  const { user, refreshUser } = useAuth()
  const [state, setState] = useState({ status: 'loading', msg: '' })
  useEffect(() => {
    api.post('/auth/verify-email', { token: params.get('token') }, { noAuth: true })
      .then((r) => { setState({ status: 'ok', msg: r.data.message }); if (user) refreshUser().catch(() => {}) })
      .catch((e) => setState({ status: 'error', msg: errMsg(e) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <PublicShell narrow>
      <div className="card p-8 text-center">
        {state.status === 'loading' && <Spinner size={28} className="mx-auto" />}
        {state.status === 'ok' && <CheckCircle2 size={40} className="mx-auto text-ok" />}
        {state.status === 'error' && <XCircle size={40} className="mx-auto text-danger" />}
        <h1 className="mt-3 text-2xl font-bold">{state.status === 'ok' ? 'Email verified' : state.status === 'error' ? 'Verification failed' : 'Verifying...'}</h1>
        <p className="mt-2 text-sm text-muted">{state.msg}</p>
        <Link className="btn-primary mt-6" to={user ? '/app' : '/login'}>{user ? 'Open dashboard' : 'Sign in'}</Link>
      </div>
    </PublicShell>
  )
}
