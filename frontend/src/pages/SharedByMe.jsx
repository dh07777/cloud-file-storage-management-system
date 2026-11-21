import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Link2, Share2, Trash2 } from 'lucide-react'
import { api, errMsg } from '../api'
import { ConfirmDialog, EmptyState, Modal, PageHeader, SkeletonRows, Tabs } from '../components/ui'
import { useToast } from '../context/Toast'
import { formatDate, timeAgo } from '../utils'

export default function SharedByMe() {
  const toast = useToast()
  const [tab, setTab] = useState('links')
  const [links, setLinks] = useState(null)
  const [collabs, setCollabs] = useState(null)
  const [acts, setActs] = useState(null)
  const [revoke, setRevoke] = useState(null)
  const [log, setLog] = useState(null)
  const [copied, setCopied] = useState(null)
  const load = useCallback(() => {
    api.get('/shares/by-me').then((r) => setLinks(r.data.items)).catch((e) => toast.error(errMsg(e)))
    api.get('/collab/workspace').then((r) => setCollabs(r.data.shared_by_me)).catch(() => {})
    api.get('/shares/activity').then((r) => setActs(r.data.items)).catch(() => {})
  }, [toast])
  useEffect(() => { load() }, [load])
  const copy = async (s) => { try { await navigator.clipboard.writeText(s.url); setCopied(s.id); setTimeout(() => setCopied(null), 1800) } catch { toast.info(s.url) } }
  const doRevoke = async () => { try { await api.delete(`/shares/${revoke.id}`); toast.success('Link revoked'); setRevoke(null); load() } catch (e) { toast.error(errMsg(e)) } }
  const removeCollab = async (c) => { try { await api.delete(`/collab/${c.id}`); toast.success('Access removed'); load() } catch (e) { toast.error(errMsg(e)) } }
  const status = (s) => s.revoked ? ['Revoked', 'text-danger'] : s.expired ? ['Expired', 'text-warn'] : ['Active', 'text-ok']
  return (
    <>
      <PageHeader title="Shared by me" subtitle="Links and collaborators you manage, and who has accessed them." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'links', label: 'Share links', count: links?.length }, { id: 'collab', label: 'Collaborators', count: collabs?.length }, { id: 'activity', label: 'Access activity' }]} />
      {tab === 'links' && (!links ? <SkeletonRows /> : links.length === 0 ? <EmptyState icon={Link2} title="No share links" text="Share a file or folder from its menu to create a link." /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[40rem]"><thead className="border-b border-line"><tr><th className="th">Item</th><th className="th">Audience</th><th className="th">Status</th><th className="th">Opens</th><th className="th">Created</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-line">{links.map((s) => { const [st, tone] = status(s); return (
            <tr key={s.id}><td className="td font-semibold">{s.item_name}<span className="chip ml-2">{s.item_type}</span></td>
              <td className="td text-muted">{s.is_public ? 'Anyone with link' : s.users.map((u) => u.username).join(', ')}{s.has_password && ' - password'}{!s.allow_download && ' - view only'}</td>
              <td className={`td font-semibold ${tone}`}>{st}</td><td className="td"><button className="text-brand underline" onClick={async () => { const r = await api.get(`/shares/${s.id}/activity`); setLog(r.data) }}>{s.access_count}</button></td>
              <td className="td text-muted">{formatDate(s.created_at)}{s.expires_at && <span className="block text-xs">expires {formatDate(s.expires_at)}</span>}</td>
              <td className="td"><div className="flex justify-end gap-1">{!s.revoked && <><button className="btn-quiet !p-1.5" aria-label="Copy link" onClick={() => copy(s)}>{copied === s.id ? <Check size={16} /> : <Copy size={16} />}</button>
                <button className="btn-quiet !p-1.5 text-danger" aria-label="Revoke link" onClick={() => setRevoke(s)}><Trash2 size={16} /></button></>}</div></td></tr>) })}</tbody></table></div>))}
      {tab === 'collab' && (!collabs ? <SkeletonRows /> : collabs.length === 0 ? <EmptyState icon={Share2} title="No collaborators" text="Invite people from a folder's Collaborators menu." /> : (
        <ul className="card divide-y divide-line">{collabs.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><p className="min-w-0 flex-1"><span className="font-semibold">{c.user.full_name}</span> ({c.user.email}) - <span className="font-semibold">{c.item_name}</span></p>
            <span className="chip capitalize">{c.permission}</span><span className="chip capitalize">{c.status}</span>
            <button className="btn-quiet !p-1.5 text-danger" aria-label={`Remove ${c.user.username}`} onClick={() => removeCollab(c)}><Trash2 size={16} /></button></li>))}</ul>))}
      {tab === 'activity' && (!acts ? <SkeletonRows /> : acts.length === 0 ? <EmptyState icon={Link2} title="No access yet" text="Opens and downloads of your links will be listed here." /> : (
        <ul className="card divide-y divide-line">{acts.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm"><p className="min-w-0 flex-1"><span className="font-semibold">{a.item_name}</span> - {a.action === 'wrong_password' ? 'wrong password attempt' : a.action === 'download' ? 'downloaded' : 'opened'} {a.user ? `by ${a.user.username}` : 'anonymously'}</p>
            <span className="hidden text-xs text-muted sm:block">{a.ip}</span><span className="text-xs text-muted">{timeAgo(a.created_at)}</span></li>))}</ul>))}
      <ConfirmDialog open={!!revoke} danger title="Revoke this link?" confirmLabel="Revoke" message="Anyone using this link will immediately lose access." onCancel={() => setRevoke(null)} onConfirm={doRevoke} />
      {log && <Modal open onClose={() => setLog(null)} title={`Access to ${log.share.item_name}`}>
        {log.items.length === 0 ? <p className="text-sm text-muted">Not accessed yet.</p> : <ul className="divide-y divide-line text-sm">{log.items.map((a) => <li key={a.id} className="flex justify-between gap-3 py-2"><span className="capitalize">{a.action.replace('_', ' ')}{a.user ? ` - ${a.user.username}` : ''}</span><span className="text-muted">{a.ip} - {formatDate(a.created_at, true)}</span></li>)}</ul>}</Modal>}
    </>
  )
}
