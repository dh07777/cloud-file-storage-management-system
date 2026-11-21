import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Info } from 'lucide-react'
import { api, downloadFile, errMsg } from '../api'
import PreviewBody from '../components/PreviewBody'
import { EmptyState, PageHeader, Skeleton } from '../components/ui'
import { useToast } from '../context/Toast'
import { formatBytes } from '../utils'

export default function FilePreview() {
  const { id } = useParams()
  const toast = useToast()
  const [f, setF] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { setF(null); api.get(`/files/${id}`).then((r) => setF(r.data.file)).catch((e) => setErr(errMsg(e))) }, [id])
  if (err) return <EmptyState title="Cannot preview" text={err} action={<Link className="btn-primary" to="/app/files">Back to My Files</Link>} />
  if (!f) return <Skeleton className="h-96" />
  return (
    <>
      <Link to={`/app/file/${f.id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={15} />Back to details</Link>
      <PageHeader title={f.name} subtitle={`${formatBytes(f.size)} - version ${f.version}`}>
        <Link className="btn-ghost" to={`/app/file/${f.id}`}><Info size={16} />Details</Link>
        <button className="btn-primary" onClick={() => downloadFile(`/files/${f.id}/download`, f.name).catch((e) => toast.error(errMsg(e)))}><Download size={16} />Download</button>
      </PageHeader>
      <div className="card p-4"><PreviewBody file={f} /></div>
    </>
  )
}
