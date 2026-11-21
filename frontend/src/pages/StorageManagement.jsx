import { useCallback, useEffect, useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { api, errMsg } from '../api'
import { Avatar, Field, PageHeader, SkeletonRows, Spinner, StatCard, StorageBar } from '../components/ui'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { formatBytes } from '../utils'

const NUM = [['max_upload_mb', 'Maximum upload size (MB)'], ['default_quota_mb', 'Default user quota (MB)'], ['collaborator_quota_mb', 'Collaborator quota (MB)'], ['trash_retention_days', 'Trash retention (days)'], ['max_versions', 'Versions kept per file']]

export default function StorageManagement() {
  const { user } = useAuth()
  const toast = useToast()
  const canEdit = user.role === 'super_admin'
  const [d, setD] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [busy, setBusy] = useState('')
  const [quota, setQuota] = useState({})
  const load = useCallback(() => {
    api.get('/admin/storage').then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e)))
    api.get('/admin/config').then((r) => setCfg(r.data.config)).catch(() => {})
  }, [toast])
  useEffect(() => { load() }, [load])
  const saveQuota = async (u) => {
    const mb = Number(quota[u.id]); if (!mb) return
    try { await api.put(`/admin/users/${u.id}`, { quota_mb: mb }); toast.success(`Quota updated for ${u.username}`); setQuota((q) => ({ ...q, [u.id]: undefined })); load() } catch (e) { toast.error(errMsg(e)) }
  }
  const saveCfg = async (e) => {
    e.preventDefault(); setBusy('cfg')
    try { const body = { ...cfg }; await api.put('/admin/config', body); toast.success('Configuration saved'); load() } catch (e2) { toast.error(errMsg(e2)) } finally { setBusy('') }
  }
  const cleanup = async () => { setBusy('clean'); try { const { data } = await api.post('/admin/storage/cleanup-trash'); toast.success(`Purged ${data.purged} expired item(s)`); load() } catch (e) { toast.error(errMsg(e)) } finally { setBusy('') } }
  return (
    <>
      <PageHeader title="Storage management" subtitle="Quotas, usage per user and platform configuration.">
        <button className="btn-ghost" onClick={cleanup} disabled={busy === 'clean'}>{busy === 'clean' ? <Spinner size={15} /> : <Trash2 size={16} />}Run trash cleanup</button></PageHeader>
      {d && <div className="mb-4 grid gap-4 sm:grid-cols-3"><StatCard label="Total used" value={formatBytes(d.total_used)} /><StatCard label="Total allocated" value={formatBytes(d.total_quota)} /><StatCard label="In trash (all users)" value={formatBytes(d.trash_bytes)} /></div>}
      {!d ? <SkeletonRows /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[40rem]"><thead className="border-b border-line"><tr><th className="th">User</th><th className="th w-56">Usage</th><th className="th">Files</th><th className="th">Quota (MB)</th></tr></thead>
          <tbody className="divide-y divide-line">{d.users.map((u) => (
            <tr key={u.id}><td className="td"><div className="flex items-center gap-3"><Avatar user={u} size={30} /><span className="font-semibold">{u.username}</span></div></td>
              <td className="td"><StorageBar used={u.used_bytes} quota={u.quota_bytes} compact /></td><td className="td">{u.file_count}</td>
              <td className="td"><div className="flex items-center gap-2"><input type="number" min="1" className="input !w-28 !py-1.5" aria-label={`Quota in MB for ${u.username}`} value={quota[u.id] ?? Math.round(u.quota_bytes / 1048576)} onChange={(e) => setQuota({ ...quota, [u.id]: e.target.value })} />
                {quota[u.id] !== undefined && <button className="btn-primary !px-2.5 !py-1.5" onClick={() => saveQuota(u)} aria-label={`Save quota for ${u.username}`}><Save size={15} /></button>}</div></td></tr>))}</tbody></table></div>)}
      {cfg && (
        <form onSubmit={saveCfg} className="card mt-6 p-5"><h2 className="font-bold">Platform configuration</h2>{!canEdit && <p className="text-xs text-muted">Only the Super Admin can change these settings.</p>}
          <fieldset disabled={!canEdit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {NUM.map(([k, l]) => <Field key={k} label={l} htmlFor={`c-${k}`}><input id={`c-${k}`} type="number" min="1" className="input" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} /></Field>)}
            <Field label="Site name" htmlFor="c-site"><input id="c-site" className="input" value={cfg.site_name} onChange={(e) => setCfg({ ...cfg, site_name: e.target.value })} /></Field>
            <div className="space-y-2 pt-6 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={!!cfg.allow_registration} onChange={(e) => setCfg({ ...cfg, allow_registration: e.target.checked })} />Allow public registration</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!cfg.require_email_verification} onChange={(e) => setCfg({ ...cfg, require_email_verification: e.target.checked })} />Require verified email to sign in</label></div>
            <div className="sm:col-span-2 lg:col-span-3"><Field label="Allowed file extensions (comma separated)" htmlFor="c-ext" hint="Executables and web-renderable formats (exe, html, svg, ...) are always refused."><textarea id="c-ext" rows={3} className="input font-mono text-xs" value={cfg.allowed_extensions} onChange={(e) => setCfg({ ...cfg, allowed_extensions: e.target.value })} /></Field></div>
          </fieldset>
          {canEdit && <button className="btn-primary mt-4" disabled={busy === 'cfg'}>{busy === 'cfg' && <Spinner size={15} />}Save configuration</button>}
        </form>)}
    </>
  )
}
