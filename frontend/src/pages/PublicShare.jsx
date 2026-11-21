import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, Eye, Folder, Lock, ShieldAlert } from 'lucide-react'
import { api, baseURL, blobUrl, downloadFile, errMsg } from '../api'
import FileIcon from '../components/FileIcon'
import PreviewBody from '../components/PreviewBody'
import PublicShell from '../components/PublicShell'
import { Modal, Spinner } from '../components/ui'
import { useToast } from '../context/Toast'
import { formatBytes } from '../utils'

/** Public (token) page. All content requests carry a short-lived signed access token obtained from /unlock. */
export default function PublicShare() {
  const { token } = useParams()
  const toast = useToast()
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState(null)
  const [access, setAccess] = useState(null)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [pwErr, setPwErr] = useState('')
  const [listing, setListing] = useState(null)
  const [preview, setPreview] = useState(null)
  const cfg = useCallback(() => ({ params: {}, headers: { 'X-Share-Access': access } }), [access])

  useEffect(() => {
    api.get(`/public/${token}`).then((r) => setInfo(r.data)).catch((e) => setErr({ status: e.response?.status, msg: errMsg(e), code: e.response?.data?.code }))
  }, [token])

  const unlock = async (e) => {
    e?.preventDefault(); setBusy(true); setPwErr('')
    try { const { data } = await api.post(`/public/${token}/unlock`, { password: pw }); setAccess(data.access) }
    catch (e2) { setPwErr(errMsg(e2)) } finally { setBusy(false) }
  }
  useEffect(() => { if (info && !info.needs_password && !access) unlock() }, [info]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadFolder = useCallback((folderId) => {
    api.get(`/public/${token}/contents`, { params: folderId ? { folder_id: folderId } : {}, headers: { 'X-Share-Access': access } })
      .then((r) => setListing(r.data)).catch((e) => toast.error(errMsg(e)))
  }, [token, access, toast])
  useEffect(() => { if (access && info?.type === 'folder') loadFolder() }, [access, info, loadFolder])

  const dl = (fileId, name) => downloadFile(`/public/${token}/download`, name, { params: fileId ? { file_id: fileId } : {}, headers: { 'X-Share-Access': access } })
    .catch((e) => toast.error(errMsg(e)))
  const view = (fileId, f) => setPreview({ fileId, f })

  if (err) {
    return (
      <PublicShell narrow><div className="card p-8 text-center">
        <ShieldAlert size={40} className="mx-auto text-warn" />
        <h1 className="mt-3 text-xl font-bold">{err.status === 410 ? 'This link has expired' : err.status === 401 ? 'Sign in required' : 'Link unavailable'}</h1>
        <p className="mt-2 text-sm text-muted">{err.msg}</p>
        {err.status === 401 && <Link className="btn-primary mt-5" to="/login" state={{ from: `/s/${token}` }}>Sign in</Link>}
      </div></PublicShell>
    )
  }
  if (!info) return <PublicShell narrow><div className="grid place-items-center py-20"><Spinner size={28} /></div></PublicShell>

  return (
    <PublicShell narrow={!access || info.type === 'file'}>
      <div className="card p-6">
        <div className="flex items-start gap-3">
          <FileIcon item={{ type: info.type, ext: info.ext, category: info.mime?.split('/')[0] }} size={32} />
          <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-bold" title={info.name}>{info.name}</h1>
            <p className="text-sm text-muted">Shared by {info.owner.full_name}{info.size != null && ` - ${formatBytes(info.size)}`}</p></div>
        </div>
        {!access ? (
          <form onSubmit={unlock} className="mt-5 space-y-3">
            <p className="flex items-center gap-2 text-sm text-muted"><Lock size={15} />This link is password protected.</p>
            <input className="input" type="password" placeholder="Password" aria-label="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            {pwErr && <p role="alert" className="text-sm text-danger">{pwErr}</p>}
            <button className="btn-primary w-full" disabled={busy || !pw}>{busy && <Spinner size={16} />}Unlock</button>
          </form>
        ) : info.type === 'file' ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => view(null, { id: 0, name: info.name, mime: info.mime, ext: info.ext, size: info.size })}><Eye size={16} />Preview</button>
            {info.allow_download ? <button className="btn-primary" onClick={() => dl(null, info.name)}><Download size={16} />Download</button>
              : <span className="chip self-center">View only</span>}
          </div>
        ) : (
          <div className="mt-5">
            {!listing ? <Spinner /> : <>
              <p className="mb-2 text-sm font-semibold">{listing.folder.name}{!listing.folder.is_root && <button className="ml-3 font-normal text-brand underline" onClick={() => loadFolder()}>Back to top</button>}</p>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {listing.folders.map((f) => <li key={`d${f.id}`}><button className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sunk" onClick={() => loadFolder(f.id)}><Folder size={18} className="text-brand" />{f.name}</button></li>)}
                {listing.files.map((f) => (
                  <li key={`f${f.id}`} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <FileIcon item={{ type: 'file', ext: f.ext, category: f.mime.split('/')[0] }} /><span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted">{formatBytes(f.size)}</span>
                    <button className="btn-quiet !p-1.5" aria-label={`Preview ${f.name}`} onClick={() => view(f.id, f)}><Eye size={16} /></button>
                    {info.allow_download && <button className="btn-quiet !p-1.5" aria-label={`Download ${f.name}`} onClick={() => dl(f.id, f.name)}><Download size={16} /></button>}
                  </li>))}
                {!listing.folders.length && !listing.files.length && <li className="px-3 py-6 text-center text-sm text-muted">This folder is empty.</li>}
              </ul></>}
          </div>)}
        {info.expires_at && <p className="mt-4 text-xs text-muted">This link expires on {new Date(info.expires_at).toLocaleString()}.</p>}
      </div>
      {preview && <Modal open onClose={() => setPreview(null)} title={preview.f.name} wide><SharedPreview token={token} access={access} item={preview} /></Modal>}
    </PublicShell>
  )
}

function SharedPreview({ token, access, item }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState('')
  const f = item.f
  const kind = f.mime?.startsWith('image/') ? 'image' : f.mime === 'application/pdf' ? 'pdf' : f.mime?.startsWith('video/') ? 'video' : f.mime?.startsWith('audio/') ? 'audio' : f.mime === 'text/plain' ? 'text' : null
  useEffect(() => {
    let u, alive = true
    if (!kind) { setErr('No preview is available for this file type.'); return }
    blobUrl(`/public/${token}/preview`, { params: item.fileId ? { file_id: item.fileId } : {}, headers: { 'X-Share-Access': access } })
      .then((x) => { u = x; alive ? setUrl(x) : URL.revokeObjectURL(x) }).catch((e) => alive && setErr(errMsg(e)))
    return () => { alive = false; if (u) URL.revokeObjectURL(u) }
  }, [token, access, item.fileId, kind])
  if (err) return <p className="py-10 text-center text-sm text-muted">{err}</p>
  if (!url) return <div className="grid place-items-center py-12"><Spinner size={24} /></div>
  if (kind === 'image') return <img src={url} alt={f.name} className="mx-auto max-h-[65vh] rounded-lg" />
  if (kind === 'video') return <video src={url} controls className="mx-auto max-h-[65vh] w-full rounded-lg bg-black" />
  if (kind === 'audio') return <audio src={url} controls className="w-full" />
  return <iframe title={f.name} src={url} className="h-[65vh] w-full rounded-lg border border-line bg-white" />
}
