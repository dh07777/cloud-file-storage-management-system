import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Eye, History, Share2, Star, Trash2, Users } from 'lucide-react'
import { api, downloadFile, errMsg } from '../api'
import CollabModal from '../components/CollabModal'
import FileIcon from '../components/FileIcon'
import ShareModal from '../components/ShareModal'
import { ConfirmDialog, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { useToast } from '../context/Toast'
import { formatBytes, formatDate } from '../utils'

export default function FileDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [f, setF] = useState(null)
  const [err, setErr] = useState('')
  const [dlg, setDlg] = useState(null)
  const load = useCallback(() => api.get(`/files/${id}`).then((r) => setF(r.data.file)).catch((e) => setErr(errMsg(e))), [id])
  useEffect(() => { setF(null); load() }, [load])
  if (err) return <EmptyState title="File not found" text={err} action={<Link className="btn-primary" to="/app/files">Back to My Files</Link>} />
  if (!f) return <Skeleton className="h-72" />
  const canEdit = ['owner', 'editor'].includes(f.permission)
  const fav = async () => { try { f.is_favorite ? await api.delete('/favorites', { params: { file_id: f.id } }) : await api.post('/favorites', { file_id: f.id }); load() } catch (e) { toast.error(errMsg(e)) } }
  const trash = async () => { try { await api.delete(`/files/${f.id}`); toast.success('Moved to trash'); nav('/app/files') } catch (e) { toast.error(errMsg(e)) } }
  const rows = [['Name', f.name], ['Type', `${f.mime} (.${f.ext})`], ['Size', `${formatBytes(f.size)} (${f.size.toLocaleString()} bytes)`], ['Uploaded', formatDate(f.created_at, true)], ['Last modified', formatDate(f.updated_at, true)],
    ['Current version', `v${f.version} of ${f.version_count}`], ['Owner', f.owner?.full_name], ['Your access', f.permission], ['Downloads', f.download_count],
    f.media && ['Dimensions', `${f.media.width} x ${f.media.height}px`], ['SHA-256', f.sha256]].filter(Boolean)
  return (
    <>
      <Link to={f.folder_id ? `/app/files/${f.folder_id}` : '/app/files'} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={15} />Back to folder</Link>
      <PageHeader title={f.name} subtitle={`${formatBytes(f.size)} - version ${f.version}`}>
        <Link className="btn-ghost" to={`/app/file/${f.id}/preview`}><Eye size={16} />Preview</Link>
        <button className="btn-primary" onClick={() => downloadFile(`/files/${f.id}/download`, f.name).catch((e) => toast.error(errMsg(e)))}><Download size={16} />Download</button>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2" aria-label="File details"><div className="mb-4 flex items-center gap-3"><FileIcon item={f} size={36} /><h2 className="text-lg font-bold">File details</h2></div>
          <dl className="divide-y divide-line text-sm">{rows.map(([k, v]) => <div key={k} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4"><dt className="w-40 shrink-0 text-muted">{k}</dt><dd className="min-w-0 break-all font-medium">{v}</dd></div>)}</dl></section>
        <section className="card h-fit space-y-2 p-5" aria-label="Actions"><h2 className="mb-1 font-bold">Actions</h2>
          <button className="btn-ghost w-full justify-start" onClick={fav}><Star size={16} className={f.is_favorite ? 'fill-warn text-warn' : ''} />{f.is_favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
          <Link className="btn-ghost w-full justify-start" to={`/app/file/${f.id}/versions`}><History size={16} />Version history ({f.version_count})</Link>
          {f.permission === 'owner' && <><button className="btn-ghost w-full justify-start" onClick={() => setDlg('share')}><Share2 size={16} />Share link{f.share_count > 0 && ` (${f.share_count} active)`}</button>
            <button className="btn-ghost w-full justify-start" onClick={() => setDlg('collab')}><Users size={16} />Collaborators</button></>}
          {canEdit && <button className="btn-ghost w-full justify-start text-danger" onClick={() => setDlg('trash')}><Trash2 size={16} />Move to trash</button>}
        </section>
      </div>
      {dlg === 'share' && <ShareModal item={{ ...f, type: 'file' }} onClose={() => { setDlg(null); load() }} />}
      {dlg === 'collab' && <CollabModal item={{ ...f, type: 'file' }} onClose={() => setDlg(null)} />}
      <ConfirmDialog open={dlg === 'trash'} danger title="Move to trash?" confirmLabel="Move to trash" message={`"${f.name}" will be moved to the trash.`} onCancel={() => setDlg(null)} onConfirm={trash} />
    </>
  )
}
