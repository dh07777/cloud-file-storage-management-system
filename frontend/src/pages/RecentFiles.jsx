import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { api, errMsg } from '../api'
import { GridView, ListView, ViewToggle, useViewPref } from '../components/FileBrowser'
import useItemActions from '../components/useItemActions'
import { EmptyState, PageHeader, SkeletonGrid, SkeletonRows, Tabs } from '../components/ui'
import { useToast } from '../context/Toast'
import { formatBytes, formatDate } from '../utils'

export default function RecentFiles() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'history' ? 'history' : 'recent'
  const toast = useToast()
  const [files, setFiles] = useState(null)
  const [hist, setHist] = useState(null)
  const [view, setView] = useViewPref()
  const load = useCallback(() => {
    api.get('/files/recent').then((r) => setFiles(r.data.items)).catch((e) => toast.error(errMsg(e)))
    api.get('/uploads/history').then((r) => setHist(r.data.items)).catch(() => {})
  }, [toast])
  useEffect(() => { load() }, [load])
  const actions = useItemActions(load)
  const STATUS = { completed: [CheckCircle2, 'text-ok'], failed: [XCircle, 'text-danger'], rejected: [XCircle, 'text-danger'], cancelled: [XCircle, 'text-muted'], duplicate: [XCircle, 'text-warn'] }
  return (
    <>
      <PageHeader title="Recent files" subtitle="What you touched lately, and your upload history.">{tab === 'recent' && <ViewToggle view={view} setView={setView} />}</PageHeader>
      <Tabs value={tab} onChange={(t) => setParams(t === 'history' ? { tab: 'history' } : {})} tabs={[{ id: 'recent', label: 'Recent files' }, { id: 'history', label: 'Upload history', count: hist?.length }]} />
      {tab === 'recent' ? (!files ? <SkeletonGrid /> : files.length === 0 ? <EmptyState icon={Clock} title="No recent files" text="Files you upload or modify will show up here." />
        : view === 'grid' ? <GridView items={files} onOpen={actions.open} onMenu={actions.openMenu} /> : <ListView items={files} onOpen={actions.open} onMenu={actions.openMenu} />)
        : (!hist ? <SkeletonRows /> : hist.length === 0 ? <EmptyState icon={Clock} title="No uploads yet" /> : (
          <div className="card overflow-x-auto"><table className="w-full min-w-[34rem]"><thead className="border-b border-line"><tr><th className="th">File</th><th className="th">Status</th><th className="th">Size</th><th className="th">When</th></tr></thead>
            <tbody className="divide-y divide-line">{hist.map((h) => { const [Icon, tone] = STATUS[h.status] || STATUS.failed; return (
              <tr key={h.id}><td className="td font-semibold">{h.filename}</td><td className="td"><span className={`inline-flex items-center gap-1.5 capitalize ${tone}`}><Icon size={15} />{h.status}</span>{h.message && h.status !== 'completed' && <span className="block text-xs text-muted">{h.message}</span>}</td>
                <td className="td text-muted">{formatBytes(h.size)}</td><td className="td text-muted">{formatDate(h.created_at, true)}</td></tr>) })}</tbody></table></div>))}
      {actions.modals}
    </>
  )
}
