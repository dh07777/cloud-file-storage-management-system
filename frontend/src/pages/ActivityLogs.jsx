import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { api, errMsg } from '../api'
import { Avatar, EmptyState, PageHeader, Pager, SkeletonRows, Tabs } from '../components/ui'
import { useToast } from '../context/Toast'
import { actionLabel, formatDate } from '../utils'

export default function ActivityLogs() {
  const [params, setParams] = useSearchParams()
  const tab = ['logs', 'security', 'tickets'].includes(params.get('tab')) ? params.get('tab') : 'logs'
  const toast = useToast()
  const [logs, setLogs] = useState(null)
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ q: '', action: '' })
  const [sec, setSec] = useState(null)
  const [tickets, setTickets] = useState(null)
  const loadLogs = useCallback(() => api.get('/admin/logs', { params: { page, q: f.q || undefined, action: f.action || undefined } }).then((r) => setLogs(r.data)).catch((e) => toast.error(errMsg(e))), [page, f, toast])
  useEffect(() => { const t = setTimeout(loadLogs, 200); return () => clearTimeout(t) }, [loadLogs])
  useEffect(() => { api.get('/admin/suspicious').then((r) => setSec(r.data)).catch(() => {}); api.get('/admin/tickets').then((r) => setTickets(r.data.items)).catch(() => {}) }, [])
  const closeTicket = async (t) => { try { await api.put(`/admin/tickets/${t.id}`, { status: t.status === 'open' ? 'closed' : 'open' }); const r = await api.get('/admin/tickets'); setTickets(r.data.items) } catch (e) { toast.error(errMsg(e)) } }
  return (
    <>
      <PageHeader title="Activity logs" subtitle="System activity, security alerts and support requests." />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: 'logs', label: 'System activity' }, { id: 'security', label: 'Suspicious activity', count: sec?.alerts.length }, { id: 'tickets', label: 'Support requests', count: tickets?.filter((t) => t.status === 'open').length }]} />
      {tab === 'logs' && (<>
        <div className="mb-3 flex flex-wrap gap-2"><input className="input max-w-xs" placeholder="Search item name or IP" aria-label="Search logs" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(1) }} />
          <select className="input !w-auto" aria-label="Filter by action" value={f.action} onChange={(e) => { setF({ ...f, action: e.target.value }); setPage(1) }}><option value="">All actions</option>{['auth', 'file', 'folder', 'share', 'collab', 'trash', 'admin', 'user'].map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
        {!logs ? <SkeletonRows /> : logs.items.length === 0 ? <EmptyState title="No activity found" /> : (<>
          <div className="card overflow-x-auto"><table className="w-full min-w-[40rem]"><thead className="border-b border-line"><tr><th className="th">When</th><th className="th">User</th><th className="th">Action</th><th className="th">IP</th></tr></thead>
            <tbody className="divide-y divide-line">{logs.items.map((l) => (
              <tr key={l.id}><td className="td whitespace-nowrap text-muted">{formatDate(l.created_at, true)}</td><td className="td"><span className="flex items-center gap-2">{l.user && <Avatar user={l.user} size={22} />}{l.user?.username || 'system'}</span></td>
                <td className="td"><span className="font-semibold">{l.action}</span> <span className="text-muted">{actionLabel(l.action)}</span> {l.target_name && <span className="font-semibold">{l.target_name}</span>}</td><td className="td text-muted">{l.ip}</td></tr>))}</tbody></table></div>
          <Pager page={logs.page} total={logs.total} perPage={logs.per_page} onChange={setPage} /></>)}</>)}
      {tab === 'security' && (!sec ? <SkeletonRows /> : (<>
        {sec.alerts.length === 0 ? <EmptyState icon={ShieldCheck} title="No suspicious activity" text="Repeated failed logins, mass downloads, rejected uploads and share-password guessing are flagged here." /> : (
          <ul className="space-y-2">{sec.alerts.map((a, i) => <li key={i} className={`card flex items-start gap-3 p-4 ${a.severity === 'high' ? 'border-danger/50' : 'border-warn/50'}`}><AlertTriangle size={18} className={a.severity === 'high' ? 'text-danger' : 'text-warn'} /><div><p className="text-sm font-semibold">{a.message}</p><p className="text-xs capitalize text-muted">{a.severity} severity - {a.type.replace('_', ' ')}</p></div></li>)}</ul>)}
        <h2 className="mb-2 mt-6 font-bold">Recent failed sign-ins</h2>
        <div className="card overflow-x-auto"><table className="w-full min-w-[30rem]"><tbody className="divide-y divide-line">{sec.recent_failed_logins.length === 0 ? <tr><td className="td text-muted">None.</td></tr> : sec.recent_failed_logins.map((s) => <tr key={s.id}><td className="td">{s.identifier}</td><td className="td text-muted">{s.ip}</td><td className="td text-muted">{formatDate(s.created_at, true)}</td></tr>)}</tbody></table></div></>))}
      {tab === 'tickets' && (!tickets ? <SkeletonRows /> : tickets.length === 0 ? <EmptyState title="No support requests" /> : (
        <ul className="space-y-3">{tickets.map((t) => (
          <li key={t.id} className="card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold">{t.subject}</p><p className="text-xs text-muted">{t.user?.username || 'deleted user'} - {formatDate(t.created_at, true)}</p></div>
            <button className="btn-ghost !py-1.5" onClick={() => closeTicket(t)}>{t.status === 'open' ? 'Mark as resolved' : 'Reopen'}</button></div><p className="mt-2 whitespace-pre-wrap text-sm text-muted">{t.message}</p></li>))}</ul>))}
    </>
  )
}
