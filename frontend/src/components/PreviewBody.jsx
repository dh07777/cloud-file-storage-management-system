import { useEffect, useState } from 'react'
import { Download, FileQuestion } from 'lucide-react'
import { api, blobUrl, downloadFile, errMsg } from '../api'
import { formatBytes, formatDuration } from '../utils'
import { Spinner } from './ui'

/** Renders a preview for a file. `file` needs {id,name,mime,ext,category,size}. Optional `version` previews an old version. */
export default function PreviewBody({ file, version, className = '' }) {
  const [url, setUrl] = useState(null)
  const [text, setText] = useState(null)
  const [err, setErr] = useState('')
  const [media, setMedia] = useState(null)
  const isText = ['txt', 'md', 'csv', 'json', 'xml', 'log', 'py', 'js', 'jsx', 'ts', 'css', 'java', 'c', 'cpp', 'sql', 'yml', 'yaml', 'ini', 'rtf'].includes(file.ext)
  const kind = isText ? 'text' : file.mime === 'application/pdf' ? 'pdf'
    : file.mime?.startsWith('image/') ? 'image' : file.mime?.startsWith('video/') ? 'video'
      : file.mime?.startsWith('audio/') ? 'audio' : 'none'
  const base = version ? `/files/${file.id}/versions/${version}` : `/files/${file.id}`

  useEffect(() => {
    let alive = true, created = null
    setUrl(null); setText(null); setErr(''); setMedia(null)
    if (kind === 'text') {
      if (version) {
        blobUrl(`${base}/download`).then(async (u) => {
          const t = await (await fetch(u)).text(); URL.revokeObjectURL(u)
          alive && setText({ content: t.slice(0, 200000), truncated: t.length > 200000 })
        }).catch((e) => alive && setErr(errMsg(e)))
      } else {
        api.get(`${base}/text`).then((r) => alive && setText(r.data)).catch((e) => alive && setErr(errMsg(e)))
      }
    } else if (kind !== 'none') {
      blobUrl(`${base}/preview`).then((u) => { created = u; alive ? setUrl(u) : URL.revokeObjectURL(u) }).catch((e) => alive && setErr(errMsg(e)))
    }
    return () => { alive = false; if (created) URL.revokeObjectURL(created) }
  }, [file.id, version, kind, base])

  if (err) return <p className="py-10 text-center text-sm text-danger">{err}</p>
  if (kind === 'none') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <FileQuestion size={40} className="text-muted" />
        <p className="text-sm text-muted">No preview is available for .{file.ext} files.</p>
        <button className="btn-primary" onClick={() => downloadFile(`${base}/download`, file.name).catch(() => {})}><Download size={16} />Download</button>
      </div>
    )
  }
  if (kind === 'text') {
    if (!text) return <div className="flex justify-center py-12"><Spinner size={24} /></div>
    return (
      <div className={className}>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-sunk p-4 font-mono text-xs leading-relaxed">{text.content}</pre>
        {text.truncated && <p className="mt-2 text-xs text-muted">Preview truncated - download the file to see everything.</p>}
      </div>
    )
  }
  if (!url) return <div className="flex justify-center py-12"><Spinner size={24} /></div>
  return (
    <div className={className}>
      {kind === 'image' && <img src={url} alt={file.name} className="mx-auto max-h-[62vh] rounded-lg object-contain"
        onLoad={(e) => setMedia({ Dimensions: `${e.target.naturalWidth} x ${e.target.naturalHeight}px` })} />}
      {kind === 'pdf' && <iframe title={file.name} src={url} className="h-[62vh] w-full rounded-lg border border-line bg-white" />}
      {kind === 'video' && <video src={url} controls className="mx-auto max-h-[62vh] w-full rounded-lg bg-black"
        onLoadedMetadata={(e) => setMedia({ Duration: formatDuration(e.target.duration), Dimensions: `${e.target.videoWidth} x ${e.target.videoHeight}px` })} />}
      {kind === 'audio' && (
        <div className="rounded-lg bg-sunk p-6"><audio src={url} controls className="w-full"
          onLoadedMetadata={(e) => setMedia({ Duration: formatDuration(e.target.duration) })} /></div>)}
      {media && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          {Object.entries(media).map(([k, v]) => <div key={k}><dt className="inline">{k}: </dt><dd className="inline font-semibold text-ink">{v}</dd></div>)}
          <div><dt className="inline">Size: </dt><dd className="inline font-semibold text-ink">{formatBytes(file.size)}</dd></div>
        </dl>)}
    </div>
  )
}
