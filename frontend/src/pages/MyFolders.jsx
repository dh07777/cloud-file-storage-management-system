import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Folder, FolderPlus, MoreVertical } from 'lucide-react'
import { api, errMsg } from '../api'
import useItemActions from '../components/useItemActions'
import { EmptyState, PageHeader, PromptDialog, SkeletonRows } from '../components/ui'
import { useToast } from '../context/Toast'
import { formatBytes, formatDate } from '../utils'

export default function MyFolders() {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [creating, setCreating] = useState(false)
  const load = useCallback(() => api.get('/folders/all').then((r) => setItems(r.data.items)).catch((e) => toast.error(errMsg(e))), [toast])
  useEffect(() => { load() }, [load])
  const actions = useItemActions(load)
  const create = async (name) => { try { await api.post('/folders', { name, parent_id: null }); toast.success('Folder created'); setCreating(false); load() } catch (e) { toast.error(errMsg(e)) } }
  return (
    <>
      <PageHeader title="My Folders" subtitle="Every folder in your vault, with its location and size.">
        <button className="btn-primary" onClick={() => setCreating(true)}><FolderPlus size={16} />New folder</button>
      </PageHeader>
      {!items ? <SkeletonRows /> : items.length === 0 ? <EmptyState icon={Folder} title="No folders yet" text="Create folders to keep your files organised." action={<button className="btn-primary" onClick={() => setCreating(true)}>Create a folder</button>} /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[36rem]">
          <thead className="border-b border-line"><tr><th className="th">Folder</th><th className="th">Files</th><th className="th">Subfolders</th><th className="th">Size</th><th className="th hidden sm:table-cell">Updated</th><th className="th w-10"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y divide-line">{items.map((f) => (
            <tr key={f.id} className="hover:bg-sunk/60" onContextMenu={(e) => actions.openMenu(e, f)}>
              <td className="td"><Link to={`/app/files/${f.id}`} className="flex items-center gap-3"><Folder size={20} className="fill-brand/20 text-brand" /><span><span className="block font-semibold">{f.name}</span><span className="block text-xs text-muted">{f.path}</span></span></Link></td>
              <td className="td">{f.file_count}</td><td className="td">{f.subfolder_count}</td><td className="td">{formatBytes(f.size)}</td>
              <td className="td hidden text-muted sm:table-cell">{formatDate(f.updated_at)}</td>
              <td className="td"><button className="btn-quiet !p-1.5" aria-label={`Actions for ${f.name}`} onClick={(e) => actions.openMenu(e, f)}><MoreVertical size={16} /></button></td></tr>))}</tbody></table></div>)}
      <PromptDialog open={creating} title="New folder" label="Folder name" confirmLabel="Create" onCancel={() => setCreating(false)} onSubmit={create} />
      {actions.modals}
    </>
  )
}
