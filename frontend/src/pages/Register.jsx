import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, errMsg } from '../api'
import PublicShell from '../components/PublicShell'
import { Field, Spinner } from '../components/ui'
import { useToast } from '../context/Toast'

export default function Register() {
  const nav = useNavigate()
  const toast = useToast()
  const [f, setF] = useState({ full_name: '', username: '', email: '', password: '', confirm: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (f.password !== f.confirm) return setErr('Passwords do not match')
    setBusy(true)
    try {
      const { data } = await api.post('/auth/register', { full_name: f.full_name, username: f.username, email: f.email, password: f.password }, { noAuth: true })
      setDone(data)
      toast.success('Account created')
    } catch (e2) { setErr(errMsg(e2)) } finally { setBusy(false) }
  }
  if (done) return (
    <PublicShell narrow><div className="card p-8 text-center">
      <h1 className="text-2xl font-bold">Check your email</h1>
      <p className="mt-2 text-sm text-muted">We sent a verification link to {f.email}. You can already sign in.</p>
      {done.dev_verify_link && <p className="mt-4 rounded-lg bg-sunk p-3 text-xs">Development mode: <a className="font-semibold text-brand underline" href={done.dev_verify_link}>verify now</a></p>}
      <button className="btn-primary mt-6" onClick={() => nav('/login')}>Go to sign in</button>
    </div></PublicShell>
  )
  return (
    <PublicShell narrow>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Full name" htmlFor="full_name"><input id="full_name" className="input" autoComplete="name" value={f.full_name} onChange={set('full_name')} /></Field>
          <Field label="Username" htmlFor="username" hint="3-30 characters: letters, numbers, . _ -"><input id="username" className="input" autoComplete="username" required value={f.username} onChange={set('username')} /></Field>
          <Field label="Email" htmlFor="email"><input id="email" type="email" className="input" autoComplete="email" required value={f.email} onChange={set('email')} /></Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters with letters and numbers"><input id="password" type="password" className="input" autoComplete="new-password" required value={f.password} onChange={set('password')} /></Field>
          <Field label="Confirm password" htmlFor="confirm"><input id="confirm" type="password" className="input" autoComplete="new-password" required value={f.confirm} onChange={set('confirm')} /></Field>
          {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner size={16} />}Create account</button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">Already have an account? <Link className="font-semibold text-brand hover:underline" to="/login">Sign in</Link></p>
      </div>
    </PublicShell>
  )
}
