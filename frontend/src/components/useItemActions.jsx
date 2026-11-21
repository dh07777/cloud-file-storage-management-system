import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Download, Eye, FolderInput, FolderOpen, History, Info, Pencil, Share2, Star, StarOff, Trash2, Upload, Users } from 'lucide-react'
import { api, downloadFile, errMsg } from '../api'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import CollabModal from './CollabModal'
import ContextMenu from './ContextMenu'
import FolderPicker from './FolderPicker'
import PreviewModal from './PreviewModal'
import ShareModal from './ShareModal'
import { ConfirmDialog, PromptDialog } from './ui'

/** Shared logic + dialogs for acting on files/folders. Render `modals` somewhere in your page. */
export default function useItemActions(reload) {
  const toast = useToast()
  const nav = useNavigate()
  const { refreshUser, user } = useAuth()
  const [menu, setMenu] = useState(null)
  const [dlg, setDlg] = useState(null) // {kind, item}
  const [busy, setBusy] = useState(false)
  const verRef = useRef(null)
  const verTarget = useRef(null)

  const done = useCallback((msg) => { if (msg) toast.success(msg); reload?.(); refreshUser().catch(() => {}) }, [reload, toast, refreshUser])
  const run = useCallback(async (fn, msg) => {
    try { await fn(); done(msg); return true } catch (e) { toast.error(errMsg(e)); return false }
  }, [done, toast])
  const base = (it) => (it.type === 'file' ? `/files/${it.id}` : `/folders/${it.id}`)

  const open = (it) => (it.type === 'folder' ? nav(`/app/files/${it.id}`) : setDlg({ kind: 'preview', item: it }))
  const toggleFav = (it) => run(() => (it.is_favorite
    ? api.delete('/favorites', { params: { [it.type === 'file' ? 'file_id' : 'folder_id']: it.id } })
    : api.post('/favorites', { [it.type === 'file' ? 'file_id' : 'folder_id']: it.id })),
  it.is_favorite ? 'Removed from favorites' : 'Added to favorites')

  const openMenu = useCallback((e, it) => {
    e.preventDefault(); e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect?.()
    const pos = e.type === 'contextmenu' || !r ? { x: e.clientX, y: e.clientY } : { x: r.right - 200, y: r.bottom + 4 }
    setMenu({ pos, item: it })
  }, [])

  const items = (it) => {
    const can = (lvl) => (lvl === 'edit' ? ['owner', 'editor'].includes(it.permission) : it.permission === 'owner')
    const isFile = it.type === 'file'
    return [
      { label: isFile ? 'Preview' : 'Open', icon: isFile ? Eye : FolderOpen, onClick: () => open(it) },
      { label: 'Download', icon: Download, hidden: !isFile, onClick: () => downloadFile(`/files/${it.id}/download`, it.name).catch((e) => toast.error(errMsg(e))) },
      { label: 'Details', icon: Info, hidden: !isFile, onClick: () => nav(`/app/file/${it.id}`) },
      { divider: true },
      { label: it.is_favorite ? 'Remove from favorites' : 'Add to favorites', icon: it.is_favorite ? StarOff : Star, onClick: () => toggleFav(it) },
      { label: 'Rename', icon: Pencil, hidden: !can('edit'), onClick: () => setDlg({ kind: 'rename', item: it }) },
      { label: 'Move to...', icon: FolderInput, hidden: isFile ? !can('edit') : !can('owner'), onClick: () => setDlg({ kind: 'move', item: it }) },
      { label: 'Make a copy...', icon: Copy, hidden: !isFile, onClick: () => setDlg({ kind: 'copy', item: it }) },
      { label: 'Share link...', icon: Share2, hidden: !can('owner') || user?.role === 'collaborator', onClick: () => setDlg({ kind: 'share', item: it }) },
      { label: 'Collaborators...', icon: Users, hidden: !can('owner'), onClick: () => setDlg({ kind: 'collab', item: it }) },
      { label: 'Version history', icon: History, hidden: !isFile, onClick: () => nav(`/app/file/${it.id}/versions`) },
      { label: 'Upload new version', icon: Upload, hidden: !isFile || !can('edit'), onClick: () => { verTarget.current = it; verRef.current?.click() } },
      { divider: true },
      { label: 'Move to trash', icon: Trash2, danger: true, hidden: isFile ? !can('edit') : !can('owner'), onClick: () => setDlg({ kind: 'trash', item: it }) },
    ]
  }

  const onVersionPicked = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    const it = verTarget.current
    if (!f || !it) return
    const form = new FormData(); form.append('file', f)
    await run(() => api.post(`/files/${it.id}/versions`, form), `Uploaded version of ${it.name}`)
  }

  const close = () => setDlg(null)
  const it = dlg?.item
  const modals = (
    <>
      <input ref={verRef} type="file" className="hidden" onChange={onVersionPicked} aria-hidden="true" tabIndex={-1} />
      {menu && <ContextMenu pos={menu.pos} items={items(menu.item)} onClose={() => setMenu(null)} />}
      {dlg?.kind === 'preview' && <PreviewModal file={it} onClose={close} />}
      <PromptDialog open={dlg?.kind === 'rename'} title={`Rename ${it?.type || ''}`} label="New name" initial={it?.name || ''} confirmLabel="Rename" onCancel={close}
        onSubmit={async (v) => { if (await run(() => api.put(base(it), { name: v }), 'Renamed')) close() }} />
      {dlg?.kind === 'move' && <FolderPicker title={`Move "${it.name}"`} confirmLabel="Move here" excludeId={it.type === 'folder' ? it.id : undefined} onClose={close}
        onPick={async (id) => { if (await run(() => api.post(`${base(it)}/move`, it.type === 'file' ? { folder_id: id } : { parent_id: id }), 'Moved')) close() }} />}
      {dlg?.kind === 'copy' && <FolderPicker title={`Copy "${it.name}"`} confirmLabel="Copy here" onClose={close}
        onPick={async (id) => { if (await run(() => api.post(`/files/${it.id}/copy`, { folder_id: id }), 'Copy created')) close() }} />}
      {dlg?.kind === 'share' && <ShareModal item={it} onClose={close} onChanged={reload} />}
      {dlg?.kind === 'collab' && <CollabModal item={it} onClose={close} />}
      <ConfirmDialog open={dlg?.kind === 'trash'} danger busy={busy} title="Move to trash?" confirmLabel="Move to trash" onCancel={close}
        message={it ? `"${it.name}"${it.type === 'folder' ? ' and everything inside it' : ''} will be moved to the trash. You can restore it until it is permanently deleted.` : ''}
        onConfirm={async () => { setBusy(true); const ok = await run(() => api.delete(base(it)), 'Moved to trash'); setBusy(false); if (ok) close() }} />
    </>
  )
  return { openMenu, modals, open, toggleFav }
}
