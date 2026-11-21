import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Clock, FileText, Folder, HardDrive, Inbox, Share2, Star } from 'lucide-react'
import { api, errMsg } from '../api'
import FileIcon from '../components/FileIcon'
import PreviewModal from '../components/PreviewModal'
import { EmptyState, PageHeader, Skeleton, StatCard, StorageBar } from '../components/ui'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { CATEGORY_COLORS, actionLabel, formatBytes, timeAgo } from '../utils'

export default function Dashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const [d, setD] = useState(null)
  const [preview, setPreview] = useState(null)
  useEffect(() => { api.get('/dashboard').then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))) }, [toast])
  if (!d) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-64" /></div>
  const u = d.usage
  return (
    <>
      <PageHeader title={`Hello, ${user.full_name?.split(' ')[0] || user.username}`} subtitle="Here is what is happening in your vault." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={HardDrive} label="Storage used" value={formatBytes(u.used)} sub={`${formatBytes(u.available)} available`} />
        <StatCard icon={FileText} label="Total files" value={u.file_count} />
        <StatCard icon={Folder} label="Total folders" value={u.folder_count} />
        <StatCard icon={Share2} label="Shared" value={d.shared_by_me + d.shared_with_me} sub={`${d.shared_by_me} by me - ${d.shared_with_me} with me`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-1" aria-label="Storage quota">
          <h2 className="mb-3 font-bold">Storage quota</h2><StorageBar used={u.used} quota={u.quota} />
          {u.percent >= 80 && <p className="mt-3 rounded-lg bg-warn/10 p-2.5 text-xs text-warn">You are running low on space. <Link className="font-semibold underline" to="/app/storage">See cleanup suggestions</Link></p>}
        </section>
        <section className="card p-5 lg:col-span-2" aria-label="File type distribution">
          <h2 className="mb-3 font-bold">File type distribution</h2>
          {d.type_distribution.length === 0 ? <p className="py-8 text-center text-sm text-muted">Upload files to see your breakdown.</p> : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-44 w-44 shrink-0"><ResponsiveContainer><PieChart><Pie data={d.type_distribution} dataKey="size" nameKey="category" innerRadius={46} outerRadius={78} paddingAngle={2} stroke="none">
                {d.type_distribution.map((t) => <Cell key={t.category} fill={CATEGORY_COLORS[t.category]} />)}</Pie>
                <Tooltip formatter={(v) => formatBytes(v)} contentStyle={{ borderRadius: 8, border: '1px solid rgb(var(--line))', background: 'rgb(var(--panel))' }} /></PieChart></ResponsiveContainer></div>
              <ul className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm">{d.type_distribution.map((t) => (
                <li key={t.category} className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: CATEGORY_COLORS[t.category] }} /><span className="capitalize">{t.category}</span><span className="ml-auto text-muted">{t.count} - {formatBytes(t.size)}</span></li>))}</ul>
            </div>)}
        </section>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-label="Recently uploaded">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Recently uploaded</h2><Link to="/app/recent" className="text-sm text-brand hover:underline">View all</Link></div>
          {d.recent_files.length === 0 ? <EmptyState icon={FileText} title="No files yet" text="Upload your first file to get started." action={<Link to="/app/files" className="btn-primary">Go to My Files</Link>} /> : (
            <ul className="divide-y divide-line">{d.recent_files.map((f) => (
              <li key={f.id}><button onClick={() => setPreview(f)} className="flex w-full items-center gap-3 py-2.5 text-left hover:opacity-80"><FileIcon item={f} />
                <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span><span className="text-xs text-muted">{formatBytes(f.size)} - {timeAgo(f.created_at)}</span></button></li>))}</ul>)}
        </section>
        <section className="card p-5" aria-label="Recent activity">
          <h2 className="mb-3 font-bold">Recent activity</h2>
          {d.recent_activity.length === 0 ? <p className="py-8 text-center text-sm text-muted">Nothing yet.</p> : (
            <ul className="space-y-3">{d.recent_activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm"><Clock size={15} className="mt-0.5 shrink-0 text-muted" />
                <p className="min-w-0 flex-1"><span className="font-semibold">{a.user?.username === user.username ? 'You' : a.user?.username || 'Someone'}</span> {actionLabel(a.action)} <span className="font-semibold">{a.target_name}</span></p>
                <span className="shrink-0 text-xs text-muted">{timeAgo(a.created_at)}</span></li>))}</ul>)}
        </section>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link to="/app/favorites" className="card flex items-center gap-3 p-4 hover:border-brand/60"><Star className="text-warn" /><div><p className="font-bold">Favorites</p><p className="text-xs text-muted">{d.favorites_count} starred item(s)</p></div></Link>
        <Link to="/app/shared-with-me" className="card flex items-center gap-3 p-4 hover:border-brand/60"><Inbox className="text-brand" /><div><p className="font-bold">Shared with me</p><p className="text-xs text-muted">{d.shared_with_me} item(s)</p></div></Link>
      </div>
      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} />}
    </>
  )
}
