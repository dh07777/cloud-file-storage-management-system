import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Inbox, X } from 'lucide-react'
import { api, downloadFile, errMsg } from '../api'
import FileIcon from '../components/FileIcon'
import PreviewModal from '../components/PreviewModal'
import { Avatar, EmptyState, PageHeader, SkeletonRows, Tabs } from '../components/ui'
import { useToast } from '../context/Toast'
import { actionLabel, formatBytes, formatDate, timeAgo } from '../utils'

export default function SharedWithMe() {
  const toast = useToast()
  const nav = useNavigate()
  const [tab, setTab] = useState('items')
  const [items, setItems] = useState(null)
  const [invites, setInvites] = useState([])
  const [activity, setActivity] = useState(null)
  const [preview, setPreview] = useState(null)
  const load = useCallback(() => {
    api.get('/shares/with-me').then((r) => setItems(r.data.items)).catch((e) => toast.error(errMsg(e)))
    api.get('/collab/invitations').then((r) => setInvites(r.data.items)).catch(() => {})
    api.get('/collab/activity').then((r) => setActivity(r.data.items)).catch(() => {})
  }, [toast])
  useEffect(() => { load() }, [load])
  const respond = async (c, accept) => {
    try { await api.post(`/collab/invitations/${c.id}/respond`, { accept }); toast.success(accept ? 'Invitation accepted' : 'Invitation declined'); window.dispatchEvent(new Event('cv:notifications')); load() }
    catch (e) { toast.error(errMsg(e)) }
  }
  const open = (x) => {
    if (x.item_type === 'folder') return nav(`/app/files/${x.item.id}`)
    if (x.kind === 'link') return nav(`/s/${x.token}`)
    setPreview(x.item)
  }
  return (
    <>
      <PageHeader title="Shared with me" subtitle="Folders and files other people have shared with you." />
      {invites.length > 0 && (
        <section className="card mb-5 border-brand/40 p-4" aria-label="Pending invitations">
          <h2 className="mb-2 font-bold">Invitations ({invites.length})</h2>
          <ul className="divide-y divide-line">{invites.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm"><Avatar user={c.owner} size={32} />
              <p className="min-w-0 flex-1"><span className="font-semibold">{c.owner.full_name}</span> invited you to {c.permission === 'editor' ? 'edit' : 'view'} <span className="font-semibold">{c.item_name}</span></p>
              <button className="btn-primary !py-1.5" onClick={() => respond(c, true)}><Check size={15} />Accept</button>
              <button className="btn-ghost !py-1.5" onClick={() => respond(c, false)}><X size={15} />Decline</button></li>))}</ul>
        </section>)}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'items', label: 'Shared items', count: items?.length }, { id: 'activity', label: 'Collaboration activity' }]} />
      {tab === 'items' ? (!items ? <SkeletonRows /> : items.length === 0 ? <EmptyState icon={Inbox} title="Nothing shared with you yet" text="When someone shares a file or folder with you, it appears here." /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[34rem]"><thead className="border-b border-line"><tr><th className="th">Name</th><th className="th">Shared by</th><th className="th">Access</th><th className="th hidden sm:table-cell">Shared</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-line">{items.map((x, i) => (
            <tr key={i} className="hover:bg-sunk/60"><td className="td"><button className="flex items-center gap-3 text-left" onClick={() => open(x)}><FileIcon item={x.item} /><span className="font-semibold">{x.item.name}</span></button></td>
              <td className="td"><span className="flex items-center gap-2"><Avatar user={x.owner} size={24} />{x.owner.username}</span></td>
              <td className="td"><span className="chip capitalize">{x.permission}</span></td><td className="td hidden text-muted sm:table-cell">{formatDate(x.shared_at)}</td>
              <td className="td text-right">{x.item_type === 'file' && x.kind === 'collaboration' && <button className="btn-quiet" onClick={() => downloadFile(`/files/${x.item.id}/download`, x.item.name).catch((e) => toast.error(errMsg(e)))}>Download</button>}</td></tr>))}</tbody></table></div>))
        : (!activity ? <SkeletonRows /> : activity.length === 0 ? <EmptyState icon={Inbox} title="No collaboration activity" /> : (
          <ul className="card divide-y divide-line">{activity.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm"><Avatar user={a.user} size={28} /><p className="min-w-0 flex-1"><span className="font-semibold">{a.user?.username}</span> {actionLabel(a.action)} <span className="font-semibold">{a.target_name}</span></p><span className="text-xs text-muted">{timeAgo(a.created_at)}</span></li>))}</ul>))}
      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} />}
    </>
  )
}
