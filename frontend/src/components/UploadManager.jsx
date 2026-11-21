import { createContext, useCallback, useContext, useReducer, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Copy, RotateCcw, UploadCloud, X } from 'lucide-react'
import { api, errMsg } from '../api'
import { useAuth } from '../context/Auth'
import { formatBytes } from '../utils'

const UploadCtx = createContext(null)
export const useUploads = () => useContext(UploadCtx)

let seq = 0
export function UploadProvider({ children }) {
  const { limits, refreshUser } = useAuth()
  const store = useRef(new Map())
  const running = useRef(0)
  const [doneCount, setDoneCount] = useState(0)
  const [, force] = useReducer((x) => x + 1, 0)

  const update = (id, patch) => { const it = store.current.get(id); if (it) { Object.assign(it, patch); force() } }

  const start = useCallback(async (it) => {
    running.current += 1
    const ctrl = new AbortController()
    update(it.id, { status: 'uploading', progress: 0, controller: ctrl, error: '' })
    const form = new FormData()
    form.append('file', it.file)
    if (it.folderId) form.append('folder_id', it.folderId)
    if (it.allowDuplicate) form.append('allow_duplicate', 'true')
    try {
      await api.post('/files/upload', form, {
        signal: ctrl.signal,
        onUploadProgress: (e) => update(it.id, { progress: e.total ? Math.round((e.loaded / e.total) * 100) : 0 }),
      })
      update(it.id, { status: 'done', progress: 100 })
      setDoneCount((c) => c + 1)
      refreshUser().catch(() => {})
    } catch (e) {
      if (e.code === 'ERR_CANCELED') {
        update(it.id, { status: 'cancelled' })
        api.post('/uploads/log', { filename: it.file.name, size: it.file.size, status: 'cancelled', message: 'Cancelled by user' }).catch(() => {})
      } else if (e.response?.data?.code === 'duplicate') {
        update(it.id, { status: 'duplicate', error: errMsg(e) })
      } else {
        update(it.id, { status: 'error', error: errMsg(e) })
      }
    } finally {
      running.current -= 1
      pump()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pump = useCallback(() => {
    for (const it of store.current.values()) {
      if (running.current >= 2) break
      if (it.status === 'queued') start(it)
    }
  }, [start])

  const enqueue = useCallback((fileList, folderId = null) => {
    const maxBytes = (limits?.max_upload_mb || 100) * 1024 * 1024
    const allowed = new Set(limits?.allowed_extensions || [])
    Array.from(fileList).forEach((file) => {
      const id = ++seq
      const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : ''
      let status = 'queued', error = ''
      if (file.size > maxBytes) { status = 'error'; error = `Larger than the ${limits?.max_upload_mb || 100} MB limit` }
      else if (allowed.size && !allowed.has(ext)) { status = 'error'; error = `.${ext || 'unknown'} files are not allowed` }
      store.current.set(id, { id, file, folderId, status, progress: 0, error })
    })
    force()
    pump()
  }, [limits, pump])

  const cancel = (id) => {
    const it = store.current.get(id)
    if (!it) return
    if (it.status === 'uploading') it.controller?.abort()
    else if (it.status === 'queued') { update(id, { status: 'cancelled' }) }
  }
  const retry = (id, allowDuplicate = false) => { update(id, { status: 'queued', error: '', allowDuplicate }); pump() }
  const dismiss = (id) => { store.current.delete(id); force() }
  const clearFinished = () => {
    for (const [id, it] of store.current) if (['done', 'cancelled', 'error', 'duplicate'].includes(it.status)) store.current.delete(id)
    force()
  }

  const items = Array.from(store.current.values())
  return (
    <UploadCtx.Provider value={{ items, enqueue, cancel, retry, dismiss, clearFinished, doneCount }}>
      {children}
      <UploadPanel />
    </UploadCtx.Provider>
  )
}

function UploadPanel() {
  const { items, cancel, retry, dismiss, clearFinished } = useUploads()
  const [open, setOpen] = useState(true)
  if (!items.length) return null
  const active = items.filter((i) => ['queued', 'uploading'].includes(i.status)).length
  return (
    <div className="pop card fixed bottom-4 right-4 z-40 w-[min(94vw,23rem)] overflow-hidden" aria-label="Uploads">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-sunk px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <UploadCloud size={16} /> {active ? `Uploading ${active} file${active > 1 ? 's' : ''}` : 'Uploads finished'}
        </div>
        <div className="flex items-center gap-1">
          {!active && <button className="btn-quiet !px-2 !py-1 text-xs" onClick={clearFinished}>Clear</button>}
          <button className="btn-quiet !p-1" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>
      {open && (
        <ul className="max-h-64 divide-y divide-line overflow-y-auto">
          {items.map((it) => (
            <li key={it.id} className="px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium" title={it.file.name}>{it.file.name}</span>
                <span className="shrink-0 text-xs text-muted">{formatBytes(it.file.size)}</span>
                {['queued', 'uploading'].includes(it.status) && (
                  <button className="text-muted hover:text-danger" onClick={() => cancel(it.id)} aria-label={`Cancel upload of ${it.file.name}`}><X size={16} /></button>
                )}
                {it.status === 'done' && <CheckCircle2 size={16} className="text-ok" />}
                {['error', 'duplicate', 'cancelled'].includes(it.status) && (
                  <button className="text-muted hover:text-ink" onClick={() => dismiss(it.id)} aria-label="Dismiss"><X size={16} /></button>
                )}
              </div>
              {it.status === 'uploading' && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunk"><div className="h-full bg-brand transition-all" style={{ width: `${it.progress}%` }} /></div>
              )}
              {it.status === 'queued' && <p className="mt-1 text-xs text-muted">Waiting...</p>}
              {it.status === 'cancelled' && <p className="mt-1 text-xs text-muted">Cancelled</p>}
              {it.status === 'error' && (
                <div className="mt-1 flex items-start gap-1.5 text-xs text-danger"><AlertCircle size={14} className="mt-0.5 shrink-0" /><span className="flex-1">{it.error}</span>
                  {it.file.size > 0 && !it.error.includes('limit') && !it.error.includes('not allowed') && (
                    <button className="inline-flex items-center gap-1 text-brand" onClick={() => retry(it.id)}><RotateCcw size={12} />Retry</button>)}
                </div>
              )}
              {it.status === 'duplicate' && (
                <div className="mt-1 text-xs"><p className="text-warn">{it.error}</p>
                  <button className="mt-1 inline-flex items-center gap-1 font-semibold text-brand" onClick={() => retry(it.id, true)}><Copy size={12} />Upload anyway</button></div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line px-3 py-1.5 text-right text-xs"><Link className="text-brand hover:underline" to="/app/recent?tab=history">Upload history</Link></div>
    </div>
  )
}
