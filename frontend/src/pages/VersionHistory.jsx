import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Eye, GitCompare, RotateCcw, Trash2, Upload } from 'lucide-react'
import { api, downloadFile, errMsg } from '../api'
import PreviewBody from '../components/PreviewBody'
import { ConfirmDialog, EmptyState, Modal, PageHeader, SkeletonRows } from '../components/ui'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { formatBytes, formatDate } from '../utils'

export default function VersionHistory() {
  const { id } = useParams()
  const toast = useToast()
  const { refreshUser } = useAuth()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState([])
  const [cmp, setCmp] = useState(null)
  const [view, setView] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const input = useRef(null)
  const load = useCallback(() => api.get(`/files/${id}/versions`).then((r) => setData(r.data)).catch((e) => setErr(errMsg(e))), [id])
  useEffect(() => { load() }, [load])
  if (err) return <EmptyState title="Cannot load versions" text={err} />
  if (!data) return <SkeletonRows />
  const f = data.file
  const canEdit = ['owner', 'editor'].includes(f.permission)
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); setSel([]); load(); refreshUser().catch(() => {}) } catch (e) { toast.error(errMsg(e)) } }
  const upload = (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; const fd = new FormData(); fd.append('file', file); const note = window.prompt('Describe this version (optional)') || ''; fd.append('note', note); act(() => api.post(`/files/${id}/versions`, fd), 'New version uploaded') }
  const toggle = (n) => setSel((s) => s.includes(n) ? s.filter((x) => x !== n) : [...s.slice(-1), n])
  const compare = async () => { const [a, b] = [...sel].sort((x, y) => x - y); try { setCmp((await api.get(`/files/${id}/versions/compare`, { params: { a, b } })).data) } catch (e) { toast.error(errMsg(e)) } }
  return (
    <>
      <Link to={`/app/file/${id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={15} />Back to details</Link>
      <PageHeader title="Version history" subtitle={`${f.name} - ${data.items.length} version(s) kept`}>
        <button className="btn-ghost" disabled={sel.length !== 2} onClick={compare}><GitCompare size={16} />Compare selected</button>
        {canEdit && <><button className="btn-primary" onClick={() => input.current?.click()}><Upload size={16} />Upload new version</button><input ref={input} type="file" className="hidden" onChange={upload} aria-label="Choose new version" /></>}
      </PageHeader>
      <div className="card overflow-x-auto"><table className="w-full min-w-[40rem]"><thead className="border-b border-line"><tr><th className="th w-10"><span className="sr-only">Select</span></th><th className="th">Version</th><th className="th">Date</th><th className="th">Size</th><th className="th hidden sm:table-cell">By</th><th className="th" /></tr></thead>
        <tbody className="divide-y divide-line">{data.items.map((v) => (
          <tr key={v.version} className={v.is_current ? 'bg-brand/5' : ''}>
            <td className="td"><input type="checkbox" checked={sel.includes(v.version)} onChange={() => toggle(v.version)} aria-label={`Select version ${v.version} for comparison`} /></td>
            <td className="td"><span className="font-semibold">v{v.version}</span>{v.is_current && <span className="chip ml-2 !bg-brand/15 !text-brand">Current</span>}{v.note && <span className="block text-xs text-muted">{v.note}</span>}</td>
            <td className="td text-muted">{formatDate(v.created_at, true)}</td><td className="td text-muted">{formatBytes(v.size)}</td><td className="td hidden text-muted sm:table-cell">{v.created_by?.username || '-'}</td>
            <td className="td"><div className="flex justify-end gap-1">
              <button className="btn-quiet !p-1.5" aria-label={`Preview version ${v.version}`} onClick={() => setView(v.version)}><Eye size={16} /></button>
              <button className="btn-quiet !p-1.5" aria-label={`Download version ${v.version}`} onClick={() => downloadFile(`/files/${id}/versions/${v.version}/download`, f.name).catch((e) => toast.error(errMsg(e)))}><Download size={16} /></button>
              {canEdit && !v.is_current && <button className="btn-quiet !p-1.5" aria-label={`Restore version ${v.version}`} onClick={() => setConfirm({ kind: 'restore', v })}><RotateCcw size={16} /></button>}
              {f.permission === 'owner' && !v.is_current && <button className="btn-quiet !p-1.5 text-danger" aria-label={`Delete version ${v.version}`} onClick={() => setConfirm({ kind: 'delete', v })}><Trash2 size={16} /></button>}</div></td></tr>))}</tbody></table></div>
      {cmp && <Modal open onClose={() => setCmp(null)} title={`Compare v${cmp.a.version} and v${cmp.b.version}`}>
        <table className="w-full text-sm"><thead><tr><th className="th" /><th className="th">v{cmp.a.version}</th><th className="th">v{cmp.b.version}</th></tr></thead><tbody className="divide-y divide-line">
          <tr><td className="td text-muted">Date</td><td className="td">{formatDate(cmp.a.created_at, true)}</td><td className="td">{formatDate(cmp.b.created_at, true)}</td></tr>
          <tr><td className="td text-muted">Size</td><td className="td">{formatBytes(cmp.a.size)}</td><td className="td">{formatBytes(cmp.b.size)}</td></tr>
          <tr><td className="td text-muted">Uploaded by</td><td className="td">{cmp.a.created_by?.username || '-'}</td><td className="td">{cmp.b.created_by?.username || '-'}</td></tr>
          <tr><td className="td text-muted">SHA-256</td><td className="td break-all font-mono text-xs">{cmp.a.sha256?.slice(0, 16)}...</td><td className="td break-all font-mono text-xs">{cmp.b.sha256?.slice(0, 16)}...</td></tr></tbody></table>
        <p className="mt-3 text-sm">Size change: <b>{cmp.diff.size_delta >= 0 ? '+' : '-'}{formatBytes(Math.abs(cmp.diff.size_delta))}</b> - Content is <b>{cmp.diff.same_content ? 'identical' : 'different'}</b>.</p></Modal>}
      {view && <Modal open onClose={() => setView(null)} title={`${f.name} - version ${view}`} wide><PreviewBody file={f} version={view} /></Modal>}
      <ConfirmDialog open={!!confirm} danger={confirm?.kind === 'delete'} title={confirm?.kind === 'restore' ? `Restore version ${confirm?.v.version}?` : `Delete version ${confirm?.v.version}?`}
        confirmLabel={confirm?.kind === 'restore' ? 'Restore' : 'Delete'} onCancel={() => setConfirm(null)}
        message={confirm?.kind === 'restore' ? 'This creates a new current version with the old content. Nothing is lost.' : 'This version will be permanently deleted.'}
        onConfirm={() => { const c = confirm; setConfirm(null); act(() => (c.kind === 'restore' ? api.post(`/files/${id}/versions/${c.v.version}/restore`) : api.delete(`/files/${id}/versions/${c.v.version}`)), c.kind === 'restore' ? 'Version restored' : 'Version deleted') }} />
    </>
  )
}
