import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, FolderPlus, Home, FolderOpen, Upload, UploadCloud } from 'lucide-react'
import { api, errMsg } from '../api'
import { GridView, ListView, ViewToggle, useViewPref } from '../components/FileBrowser'
import { useUploads } from '../components/UploadManager'
import useItemActions from '../components/useItemActions'
import { EmptyState, PageHeader, PromptDialog, SkeletonGrid } from '../components/ui'
import { useToast } from '../context/Toast'

export default function MyFiles() {
  const { folderId } = useParams()
  const toast = useToast()
  const { enqueue, doneCount } = useUploads()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useViewPref()
  const [sort, setSort] = useState('name')
  const [order, setOrder] = useState('asc')
  const [newFolder, setNewFolder] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileInput = useRef(null)
  const depth = useRef(0)

  const load = useCallback(() => {
    api.get('/folders/contents', { params: { folder_id: folderId || undefined, sort, order } })
      .then((r) => { setData(r.data); setError('') }).catch((e) => setError(errMsg(e)))
  }, [folderId, sort, order])
  useEffect(() => { setData(null); load() }, [load])
  useEffect(() => { if (doneCount) load() }, [doneCount]) // eslint-disable-line react-hooks/exhaustive-deps
  const actions = useItemActions(load)

  const canWrite = !data || ['owner', 'editor'].includes(data.permission)
  const upload = (files) => { if (!canWrite) return toast.error('You have read-only access to this folder'); if (files?.length) enqueue(files, folderId || null) }
  const onDrop = (e) => { e.preventDefault(); depth.current = 0; setDrag(false); upload(e.dataTransfer.files) }

  const createFolder = async (name) => {
    try { await api.post('/folders', { name, parent_id: folderId || null }); toast.success('Folder created'); setNewFolder(false); load() } catch (e) { toast.error(errMsg(e)) }
  }
  const items = data ? [...data.folders, ...data.files] : []
  const onChangeSort = (v) => { const [s, o] = v.split(':'); setSort(s); setOrder(o) }

  return (
    <div onDragEnter={(e) => { e.preventDefault(); depth.current++; setDrag(true) }} onDragLeave={() => { if (--depth.current <= 0) setDrag(false) }}
      onDragOver={(e) => e.preventDefault()} onDrop={onDrop} className="relative min-h-[70vh]">
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <Link to="/app/files" className="inline-flex items-center gap-1.5 font-semibold text-muted hover:text-ink"><Home size={15} />My Files</Link>
        {data?.breadcrumbs.map((b, i) => (
          <span key={b.id} className="flex items-center gap-1"><ChevronRight size={14} className="text-muted" />
            {i === data.breadcrumbs.length - 1 ? <span className="font-bold" aria-current="page">{b.name}</span> : <Link className="font-semibold text-muted hover:text-ink" to={`/app/files/${b.id}`}>{b.name}</Link>}</span>))}
      </nav>
      <PageHeader title={data?.folder ? data.folder.name : 'My Files'} subtitle={data?.permission && data.permission !== 'owner' ? `Shared by ${data.folder?.owner?.full_name} - you have ${data.permission} access` : undefined}>
        <select className="input !w-auto" value={`${sort}:${order}`} onChange={(e) => onChangeSort(e.target.value)} aria-label="Sort">
          <option value="name:asc">Name A-Z</option><option value="name:desc">Name Z-A</option><option value="date:desc">Newest first</option>
          <option value="date:asc">Oldest first</option><option value="size:desc">Largest first</option><option value="size:asc">Smallest first</option><option value="type:asc">Type</option>
        </select>
        <ViewToggle view={view} setView={setView} />
        {canWrite && <><button className="btn-ghost" onClick={() => setNewFolder(true)}><FolderPlus size={16} />New folder</button>
          <button className="btn-primary" onClick={() => fileInput.current?.click()}><Upload size={16} />Upload</button></>}
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = '' }} aria-label="Choose files to upload" />
      </PageHeader>

      {error ? <EmptyState icon={FolderOpen} title="Cannot open this folder" text={error} action={<Link to="/app/files" className="btn-primary">Back to My Files</Link>} />
        : !data ? <SkeletonGrid />
          : items.length === 0 ? (
            <EmptyState icon={UploadCloud} title="This folder is empty" text={canWrite ? 'Drag and drop files here, or use the Upload button.' : 'Nothing has been added here yet.'}
              action={canWrite && <button className="btn-primary" onClick={() => fileInput.current?.click()}><Upload size={16} />Upload files</button>} />
          ) : view === 'grid' ? <GridView items={items} onOpen={actions.open} onMenu={actions.openMenu} /> : <ListView items={items} onOpen={actions.open} onMenu={actions.openMenu} showOwner={data.permission !== 'owner'} />}

      {drag && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-xl border-2 border-dashed border-brand bg-brand/10 backdrop-blur-[1px]">
          <div className="text-center"><UploadCloud size={44} className="mx-auto text-brand" /><p className="mt-2 text-lg font-bold">Drop files to upload</p></div>
        </div>)}
      <PromptDialog open={newFolder} title="New folder" label="Folder name" confirmLabel="Create" onCancel={() => setNewFolder(false)} onSubmit={createFolder} />
      {actions.modals}
    </div>
  )
}
