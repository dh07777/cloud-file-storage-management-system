import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Bell, CheckCheck, Download, FileUp, Share2, Trash2, UserPlus, X } from 'lucide-react'
import { api, errMsg } from '../api'
import { EmptyState, PageHeader, SkeletonRows } from '../components/ui'
import { useToast } from '../context/Toast'
import { timeAgo } from '../utils'

const ICON = { file_uploaded: FileUp, file_shared: Share2, file_downloaded: Download, storage_warning: AlertTriangle, share_accessed: Share2, collab_invite: UserPlus, file_deleted: Trash2 }

export default function Notifications() {
  const toast = useToast()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const ping = () => window.dispatchEvent(new Event('cv:notifications'))
  const load = useCallback(() => api.get('/notifications').then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e))), [toast])
  useEffect(() => { load() }, [load])
  const open = async (n) => { if (!n.is_read) { await api.post(`/notifications/${n.id}/read`).catch(() => {}); ping() } if (n.link) nav(n.link); else load() }
  const markAll = async () => { await api.post('/notifications/read-all'); ping(); load() }
  const del = async (n) => { await api.delete(`/notifications/${n.id}`); ping(); load() }
  const clear = async () => { await api.delete('/notifications'); ping(); load() }
  return (
    <>
      <PageHeader title="Notifications" subtitle={data ? `${data.unread} unread` : ''}>
        <button className="btn-ghost" onClick={markAll} disabled={!data?.unread}><CheckCheck size={16} />Mark all read</button>
        <button className="btn-ghost" onClick={clear} disabled={!data?.items.length}><Trash2 size={16} />Clear all</button>
      </PageHeader>
      {!data ? <SkeletonRows /> : data.items.length === 0 ? <EmptyState icon={Bell} title="You are all caught up" text="Uploads, shares, invitations and storage alerts will appear here." /> : (
        <ul className="card divide-y divide-line">{data.items.map((n) => { const Icon = ICON[n.type] || Bell; return (
          <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.is_read ? '' : 'bg-brand/5'}`}>
            <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${n.type === 'storage_warning' ? 'bg-warn/15 text-warn' : 'bg-brand/15 text-brand'}`}><Icon size={16} /></span>
            <button className="min-w-0 flex-1 text-left" onClick={() => open(n)}><p className={`text-sm ${n.is_read ? 'font-medium' : 'font-bold'}`}>{n.title}</p><p className="text-sm text-muted">{n.message}</p><p className="mt-0.5 text-xs text-muted">{timeAgo(n.created_at)}</p></button>
            <button className="btn-quiet !p-1.5" aria-label="Delete notification" onClick={() => del(n)}><X size={15} /></button></li>) })}</ul>)}
    </>
  )
}
