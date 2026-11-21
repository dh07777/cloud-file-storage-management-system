import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Lightbulb } from 'lucide-react'
import { api, errMsg } from '../api'
import FileIcon from '../components/FileIcon'
import { PageHeader, Skeleton, StatCard, StorageBar } from '../components/ui'
import { useToast } from '../context/Toast'
import { CATEGORY_COLORS, formatBytes } from '../utils'

const tip = { contentStyle: { borderRadius: 8, border: '1px solid rgb(var(--line))', background: 'rgb(var(--panel))', color: 'rgb(var(--ink))' } }

export default function StorageAnalytics() {
  const toast = useToast()
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/storage/analytics').then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))) }, [toast])
  if (!d) return <div className="space-y-4"><Skeleton className="h-10 w-60" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>
  const u = d.usage
  return (
    <>
      <PageHeader title="Storage analytics" subtitle="Understand what is using your space." />
      <div className="card p-5"><StorageBar used={u.used} quota={u.quota} /></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="In trash" value={formatBytes(d.trash_size)} sub="still counts toward quota" />
        <StatCard label="Old versions" value={formatBytes(d.old_versions_size)} sub="previous file versions" />
        <StatCard label="Duplicate sets" value={d.duplicate_groups} sub="identical files" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-label="Usage by file type"><h2 className="mb-3 font-bold">By file type</h2>
          {d.type_distribution.length === 0 ? <p className="py-10 text-center text-sm text-muted">No files yet.</p> : (
            <div className="h-60"><ResponsiveContainer><BarChart data={d.type_distribution} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid horizontal={false} stroke="rgb(var(--line))" /><XAxis type="number" tickFormatter={(v) => formatBytes(v, 0)} stroke="rgb(var(--muted))" fontSize={12} />
              <YAxis type="category" dataKey="category" stroke="rgb(var(--muted))" fontSize={12} width={70} /><Tooltip {...tip} formatter={(v) => formatBytes(v)} />
              <Bar dataKey="size" radius={[0, 6, 6, 0]}>{d.type_distribution.map((t) => <Cell key={t.category} fill={CATEGORY_COLORS[t.category]} />)}</Bar></BarChart></ResponsiveContainer></div>)}</section>
        <section className="card p-5" aria-label="Uploads over time"><h2 className="mb-3 font-bold">Uploaded data - last 30 days</h2>
          <div className="h-60"><ResponsiveContainer><AreaChart data={d.timeline}><CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey="date" tickFormatter={(s) => s.slice(5)} stroke="rgb(var(--muted))" fontSize={12} minTickGap={24} /><YAxis tickFormatter={(v) => formatBytes(v, 0)} stroke="rgb(var(--muted))" fontSize={12} width={60} />
            <Tooltip {...tip} formatter={(v) => formatBytes(v)} /><Area type="monotone" dataKey="uploaded" stroke="rgb(var(--brand))" fill="rgb(var(--brand) / .2)" /></AreaChart></ResponsiveContainer></div></section>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-label="Largest files"><h2 className="mb-3 font-bold">Largest files</h2>
          {d.large_files.length === 0 ? <p className="py-6 text-center text-sm text-muted">No files yet.</p> : (
            <ul className="divide-y divide-line">{d.large_files.map((f) => <li key={f.id}><Link to={`/app/file/${f.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80"><FileIcon item={f} /><span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span><span className="text-sm text-muted">{formatBytes(f.size)}</span></Link></li>)}</ul>)}</section>
        <section className="card p-5" aria-label="Cleanup suggestions"><h2 className="mb-3 flex items-center gap-2 font-bold"><Lightbulb size={18} className="text-warn" />Cleanup suggestions</h2>
          {d.suggestions.length === 0 ? <p className="py-6 text-center text-sm text-muted">Your storage looks tidy. Nothing to clean up.</p> : (
            <ul className="space-y-3">{d.suggestions.map((s) => <li key={s.id} className="rounded-lg border border-line p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{s.title}</p><p className="text-xs text-muted">{s.description}</p></div>
              <span className="chip shrink-0">{formatBytes(s.bytes)}</span></div><Link to={s.link} className="mt-1 inline-block text-sm font-semibold text-brand hover:underline">Review</Link></li>)}</ul>)}</section>
      </div>
    </>
  )
}
