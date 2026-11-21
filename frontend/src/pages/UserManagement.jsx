import { useCallback, useEffect, useState } from 'react'
import { Ban, CheckCircle2, KeyRound, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { api, errMsg } from '../api'
import { Avatar, ConfirmDialog, EmptyState, Field, Modal, PageHeader, Pager, SkeletonRows, Spinner, StorageBar } from '../components/ui'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { formatDate } from '../utils'

const ROLES = [['super_admin', 'Super Admin'], ['admin', 'Administrator'], ['user', 'Regular User'], ['collaborator', 'Shared Collaborator']]

export default function UserManagement() {
  const { user: me } = useAuth()
  const toast = useToast()
  const isSuper = me.role === 'super_admin'
  const [res, setRes] = useState(null)
  const [f, setF] = useState({ q: '', role: '', status: '', page: 1 })
  const [edit, setEdit] = useState(null)
  const [create, setCreate] = useState(false)
  const [del, setDel] = useState(null)
  const load = useCallback(() => api.get('/admin/users', { params: Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')) }).then((r) => setRes(r.data)).catch((e) => toast.error(errMsg(e))), [f, toast])
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load])
  const patch = async (u, body, msg) => { try { await api.put(`/admin/users/${u.id}`, body); toast.success(msg); load() } catch (e) { toast.error(errMsg(e)) } }
  const remove = async () => { try { await api.delete(`/admin/users/${del.id}`); toast.success('User deleted'); setDel(null); load() } catch (e) { toast.error(errMsg(e)) } }
  const canManage = (u) => u.id !== me.id && (isSuper || !['admin', 'super_admin'].includes(u.role))

  return (
    <>
      <PageHeader title="User management" subtitle="Create accounts, change roles, set quotas and suspend access."><button className="btn-primary" onClick={() => setCreate(true)}><Plus size={16} />New user</button></PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[14rem] flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-9" placeholder="Search name, username or email" aria-label="Search users" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} /></div>
        <select className="input !w-auto" aria-label="Filter by role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, page: 1 })}><option value="">All roles</option>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select className="input !w-auto" aria-label="Filter by status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
      </div>
      {!res ? <SkeletonRows /> : res.items.length === 0 ? <EmptyState title="No users match" /> : (<>
        <div className="card overflow-x-auto"><table className="w-full min-w-[48rem]"><thead className="border-b border-line"><tr><th className="th">User</th><th className="th">Role</th><th className="th w-48">Storage</th><th className="th">Last login</th><th className="th">Status</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-line">{res.items.map((u) => (
            <tr key={u.id}><td className="td"><div className="flex items-center gap-3"><Avatar user={u} size={34} /><div className="min-w-0"><p className="truncate font-semibold">{u.full_name || u.username}</p><p className="truncate text-xs text-muted">{u.email}</p></div></div></td>
              <td className="td"><span className="chip">{u.role_label}</span></td><td className="td"><StorageBar used={u.used_bytes} quota={u.quota_bytes} compact /></td>
              <td className="td text-muted">{u.last_login_at ? formatDate(u.last_login_at) : 'Never'}</td>
              <td className="td">{u.is_active ? <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 size={14} />Active</span> : <span className="inline-flex items-center gap-1 text-danger"><Ban size={14} />Suspended</span>}</td>
              <td className="td"><div className="flex justify-end gap-1">{canManage(u) && <>
                <button className="btn-quiet !p-1.5" aria-label={`Edit ${u.username}`} onClick={() => setEdit(u)}><Pencil size={16} /></button>
                <button className="btn-quiet !p-1.5" aria-label={u.is_active ? `Suspend ${u.username}` : `Reactivate ${u.username}`} onClick={() => patch(u, { is_active: !u.is_active }, u.is_active ? 'User suspended' : 'User reactivated')}>{u.is_active ? <Ban size={16} /> : <CheckCircle2 size={16} />}</button>
                {isSuper && <button className="btn-quiet !p-1.5 text-danger" aria-label={`Delete ${u.username}`} onClick={() => setDel(u)}><Trash2 size={16} /></button>}</>}</div></td></tr>))}</tbody></table></div>
        <Pager page={res.page} total={res.total} perPage={res.per_page} onChange={(p) => setF({ ...f, page: p })} /></>)}
      {edit && <EditUser u={edit} isSuper={isSuper} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
      {create && <CreateUser isSuper={isSuper} onClose={() => setCreate(false)} onSaved={() => { setCreate(false); load() }} />}
      <ConfirmDialog open={!!del} danger title="Delete this user?" confirmLabel="Delete user and files" message={`"${del?.username}" and ALL of their files, folders and shares will be permanently deleted. This cannot be undone.`} onCancel={() => setDel(null)} onConfirm={remove} />
    </>
  )
}

function EditUser({ u, isSuper, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState({ role: u.role, quota_mb: Math.round(u.quota_bytes / 1048576), new_password: '' })
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true)
    const body = { quota_mb: Number(f.quota_mb) }
    if (f.role !== u.role) body.role = f.role
    if (f.new_password) body.new_password = f.new_password
    try { await api.put(`/admin/users/${u.id}`, body); toast.success('User updated'); onSaved() } catch (e2) { toast.error(errMsg(e2)) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Edit ${u.username}`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Role" htmlFor="eu-role"><select id="eu-role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.filter(([v]) => isSuper || !['admin', 'super_admin'].includes(v) || v === u.role).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Storage quota (MB)" htmlFor="eu-q" hint={`Currently using ${(u.used_bytes / 1048576).toFixed(1)} MB`}><input id="eu-q" type="number" min="1" className="input" value={f.quota_mb} onChange={(e) => setF({ ...f, quota_mb: e.target.value })} /></Field>
        <Field label="Reset password (optional)" htmlFor="eu-pw" hint="Signs the user out everywhere"><div className="relative"><KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input id="eu-pw" type="password" className="input !pl-9" autoComplete="new-password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></div></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy && <Spinner size={15} />}Save</button></div>
      </form>
    </Modal>
  )
}

function CreateUser({ isSuper, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState({ full_name: '', username: '', email: '', password: '', role: 'user' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => { e.preventDefault(); setBusy(true); try { await api.post('/admin/users', f); toast.success('User created'); onSaved() } catch (e2) { toast.error(errMsg(e2)) } finally { setBusy(false) } }
  return (
    <Modal open onClose={onClose} title="New user">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Full name" htmlFor="cu-n"><input id="cu-n" className="input" value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Username" htmlFor="cu-u"><input id="cu-u" className="input" required value={f.username} onChange={set('username')} /></Field>
        <Field label="Email" htmlFor="cu-e"><input id="cu-e" type="email" className="input" required value={f.email} onChange={set('email')} /></Field>
        <Field label="Temporary password" htmlFor="cu-p"><input id="cu-p" type="password" className="input" autoComplete="new-password" required value={f.password} onChange={set('password')} /></Field>
        <Field label="Role" htmlFor="cu-r"><select id="cu-r" className="input" value={f.role} onChange={set('role')}>{ROLES.filter(([v]) => isSuper || !['admin', 'super_admin'].includes(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy && <Spinner size={15} />}Create user</button></div>
      </form>
    </Modal>
  )
}
