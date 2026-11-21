import { useEffect, useRef, useState } from 'react'
import { Camera, Monitor, Moon, Sun, Trash2 } from 'lucide-react'
import { api, errMsg } from '../api'
import { Avatar, Field, PageHeader, Spinner, StorageBar, Tabs, clearAvatarCache } from '../components/ui'
import { useAuth } from '../context/Auth'
import { useTheme } from '../context/Theme'
import { useToast } from '../context/Toast'
import { formatDate } from '../utils'

export default function Settings() {
  const { user, usage, setUser, refreshUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const [tab, setTab] = useState('profile')
  const [p, setP] = useState({ full_name: user.full_name || '', username: user.username, bio: user.bio || '' })
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' })
  const [hist, setHist] = useState(null)
  const [busy, setBusy] = useState('')
  const [avatarV, setAvatarV] = useState(0)
  const file = useRef(null)
  useEffect(() => { if (tab === 'security') api.get('/auth/login-history').then((r) => setHist(r.data.items)).catch(() => {}) }, [tab])

  const save = async (e) => { e.preventDefault(); setBusy('profile'); try { const { data } = await api.put('/auth/me', p); setUser(data.user); toast.success('Profile saved') } catch (e2) { toast.error(errMsg(e2)) } finally { setBusy('') } }
  const changePw = async (e) => {
    e.preventDefault()
    if (pw.new_password !== pw.confirm) return toast.error('New passwords do not match')
    setBusy('pw')
    try { await api.post('/auth/change-password', { current_password: pw.current_password, new_password: pw.new_password }); toast.success('Password changed'); setPw({ current_password: '', new_password: '', confirm: '' }) }
    catch (e2) { toast.error(errMsg(e2)) } finally { setBusy('') }
  }
  const avatar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    const fd = new FormData(); fd.append('avatar', f); setBusy('avatar')
    try { const { data } = await api.post('/auth/me/avatar', fd); clearAvatarCache(); setUser(data.user); setAvatarV((v) => v + 1); toast.success('Profile image updated') }
    catch (e2) { toast.error(errMsg(e2)) } finally { setBusy('') }
  }
  const removeAvatar = async () => { try { const { data } = await api.delete('/auth/me/avatar'); clearAvatarCache(); setUser(data.user); setAvatarV((v) => v + 1) } catch (e2) { toast.error(errMsg(e2)) } }
  const pickTheme = async (t) => { setTheme(t); try { await api.put('/auth/me', { theme: t }) } catch { /* local only */ } }

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your profile, security and appearance." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'profile', label: 'Profile' }, { id: 'security', label: 'Security' }, { id: 'appearance', label: 'Appearance' }, { id: 'storage', label: 'Storage' }]} />
      {tab === 'profile' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card flex flex-col items-center gap-3 p-6 text-center">
            <Avatar user={{ ...user, avatar_v: avatarV }} size={96} />
            <div><p className="font-bold">{user.full_name || user.username}</p><p className="text-sm text-muted">{user.email}</p><span className="chip mt-2">{user.role_label}</span></div>
            <div className="flex gap-2"><button className="btn-ghost" onClick={() => file.current?.click()} disabled={busy === 'avatar'}>{busy === 'avatar' ? <Spinner size={15} /> : <Camera size={15} />}Change photo</button>
              {user.has_avatar && <button className="btn-quiet text-danger" onClick={removeAvatar} aria-label="Remove photo"><Trash2 size={15} /></button>}</div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={avatar} aria-label="Upload profile image" />
            <p className="text-xs text-muted">Member since {formatDate(user.created_at)}</p>
          </section>
          <form onSubmit={save} className="card space-y-4 p-6 lg:col-span-2">
            <Field label="Full name" htmlFor="s-name"><input id="s-name" className="input" value={p.full_name} onChange={(e) => setP({ ...p, full_name: e.target.value })} /></Field>
            <Field label="Username" htmlFor="s-user"><input id="s-user" className="input" value={p.username} onChange={(e) => setP({ ...p, username: e.target.value })} /></Field>
            <Field label="Email" htmlFor="s-email" hint={user.email_verified ? 'Verified' : 'Not verified yet'}><input id="s-email" className="input" value={user.email} disabled /></Field>
            <Field label="Bio" htmlFor="s-bio"><textarea id="s-bio" rows={3} maxLength={300} className="input" value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} /></Field>
            <button className="btn-primary" disabled={busy === 'profile'}>{busy === 'profile' && <Spinner size={15} />}Save changes</button>
          </form>
        </div>)}
      {tab === 'security' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={changePw} className="card space-y-4 p-6"><h2 className="font-bold">Change password</h2>
            <Field label="Current password" htmlFor="cp"><input id="cp" type="password" className="input" autoComplete="current-password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="New password" htmlFor="np2" hint="At least 8 characters with letters and numbers"><input id="np2" type="password" className="input" autoComplete="new-password" required value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
            <Field label="Confirm new password" htmlFor="np3"><input id="np3" type="password" className="input" autoComplete="new-password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <button className="btn-primary" disabled={busy === 'pw'}>{busy === 'pw' && <Spinner size={15} />}Update password</button></form>
          <section className="card p-6"><h2 className="mb-3 font-bold">Login history</h2>
            {!hist ? <Spinner /> : <ul className="max-h-96 divide-y divide-line overflow-y-auto text-sm">{hist.map((h) => (
              <li key={h.id} className="py-2.5"><div className="flex items-center justify-between gap-2"><span className={`font-semibold ${h.success ? 'text-ok' : 'text-danger'}`}>{h.success ? 'Signed in' : 'Failed attempt'}</span><span className="text-xs text-muted">{formatDate(h.created_at, true)}</span></div>
                <p className="truncate text-xs text-muted">{h.ip} - {h.user_agent}</p></li>))}</ul>}</section>
        </div>)}
      {tab === 'appearance' && (
        <section className="card p-6"><h2 className="mb-4 font-bold">Theme</h2><div className="grid max-w-md grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
          {[['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'System']].map(([t, Icon, l]) => (
            <button key={t} role="radio" aria-checked={theme === t} onClick={() => pickTheme(t)} className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-semibold transition ${theme === t ? 'border-brand bg-brand/10' : 'border-line hover:bg-sunk'}`}><Icon size={22} />{l}</button>))}</div></section>)}
      {tab === 'storage' && usage && (
        <section className="card max-w-xl p-6"><h2 className="mb-4 font-bold">Your storage</h2><StorageBar used={usage.used} quota={usage.quota} />
          <p className="mt-3 text-sm text-muted">{usage.file_count} files in {usage.folder_count} folders. Quotas are set by administrators.</p></section>)}
    </>
  )
}
