import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, AlertTriangle, Files, HardDrive, Users } from 'lucide-react'
import { api, errMsg } from '../api'
import { PageHeader, Skeleton, StatCard } from '../components/ui'
import { useToast } from '../context/Toast'
import { CATEGORY_COLORS, formatBytes, timeAgo } from '../utils'

const tip = { contentStyle: { borderRadius: 8, border: '1px solid rgb(var(--line))', background: 'rgb(var(--panel))', color: 'rgb(var(--ink))' } }
const COLORS = ['#2dd4aa', '#60a5fa', '#a78bfa', '#fbbf24', '#fb923c', '#f472b6', '#94a3b8', '#34d399']

export default function AdminDashboard() {
  const toast = useToast()
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/admin/stats').then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))) }, [toast])
  if (!d) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-64" /></div>
  return (
    <>
      <PageHeader title="Admin dashboard" subtitle="Live platform overview." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total users" value={d.total_users} sub={`${d.suspended_users} suspended`} />
        <StatCard icon={Activity} label="Active users" value={d.active_users_now} sub={`${d.active_users_24h} in the last 24h`} />
        <StatCard icon={Files} label="Stored files" value={d.total_files} sub={`${d.total_folders} folders`} />
        <StatCard icon={HardDrive} label="Storage used" value={formatBytes(d.total_storage_used)} sub={`of ${formatBytes(d.total_quota_allocated)} allocated`} />
      </div>
      {d.suspicious_count > 0 && <Link to="/app/admin/activity?tab=security" className="card mt-4 flex items-center gap-3 border-danger/40 bg-danger/5 p-4"><AlertTriangle className="text-danger" /><p className="text-sm"><b>{d.suspicious_count} suspicious activity alert(s)</b> need your attention. Review them</p></Link>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-label="Storage by user"><h2 className="mb-3 font-bold">Storage distribution by user</h2>
          {d.storage_by_user.length === 0 ? <p className="py-10 text-center text-sm text-muted">No data yet.</p> : <div className="h-60"><ResponsiveContainer><BarChart data={d.storage_by_user}><CartesianGrid vertical={false} stroke="rgb(var(--line))" /><XAxis dataKey="username" stroke="rgb(var(--muted))" fontSize={12} />
            <YAxis tickFormatter={(v) => formatBytes(v, 0)} stroke="rgb(var(--muted))" fontSize={12} width={60} /><Tooltip {...tip} formatter={(v) => formatBytes(v)} /><Bar dataKey="bytes" radius={[6, 6, 0, 0]}>{d.storage_by_user.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>}</section>
        <section className="card p-5" aria-label="Storage by type"><h2 className="mb-3 font-bold">Storage by file type</h2>
          {d.storage_by_type.length === 0 ? <p className="py-10 text-center text-sm text-muted">No data yet.</p> : <div className="h-60"><ResponsiveContainer><PieChart><Pie data={d.storage_by_type} dataKey="size" nameKey="category" outerRadius={85} innerRadius={45} stroke="none">{d.storage_by_type.map((t) => <Cell key={t.category} fill={CATEGORY_COLORS[t.category]} />)}</Pie><Tooltip {...tip} formatter={(v) => formatBytes(v)} /></PieChart></ResponsiveContainer></div>}</section>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-label="Uploads per day"><h2 className="mb-3 font-bold">Uploads - last 14 days</h2>
          <div className="h-52"><ResponsiveContainer><BarChart data={d.uploads_timeline}><CartesianGrid vertical={false} stroke="rgb(var(--line))" /><XAxis dataKey="date" tickFormatter={(s) => s.slice(5)} stroke="rgb(var(--muted))" fontSize={12} minTickGap={16} /><YAxis allowDecimals={false} stroke="rgb(var(--muted))" fontSize={12} width={30} /><Tooltip {...tip} /><Bar dataKey="uploads" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
        <section className="card p-5" aria-label="Recent uploads"><h2 className="mb-3 font-bold">Recent uploads</h2>
          {d.recent_uploads.length === 0 ? <p className="py-8 text-center text-sm text-muted">No uploads yet.</p> : <ul className="divide-y divide-line text-sm">{d.recent_uploads.map((u) => <li key={u.id} className="flex items-center gap-3 py-2"><span className="min-w-0 flex-1 truncate font-semibold">{u.filename}</span><span className="text-muted">{u.username}</span><span className="text-xs text-muted">{formatBytes(u.size)} - {timeAgo(u.created_at)}</span></li>)}</ul>}</section>
      </div>
    </>
  )
}
