import { useCallback, useEffect, useState } from 'react'
import { Trash2, UserPlus } from 'lucide-react'
import { api, errMsg } from '../api'
import { useToast } from '../context/Toast'
import { Avatar, Modal, Spinner } from './ui'

export default function CollabModal({ item, onClose }) {
  const toast = useToast()
  const key = item.type === 'file' ? 'file_id' : 'folder_id'
  const [list, setList] = useState(null)
  const [email, setEmail] = useState('')
  const [perm, setPerm] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api.get('/collab/item', { params: { [key]: item.id } }).then((r) => setList(r.data.items)).catch((e) => toast.error(errMsg(e))), [item.id, key, toast])
  useEffect(() => { load() }, [load])

  const invite = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post('/collab/invite', { [key]: item.id, email, permission: perm }); toast.success('Invitation sent'); setEmail(''); load() }
    catch (err) { toast.error(errMsg(err)) } finally { setBusy(false) }
  }
  const change = async (c, permission) => {
    try { await api.put(`/collab/${c.id}`, { permission }); load() } catch (e) { toast.error(errMsg(e)) }
  }
  const remove = async (c) => {
    try { await api.delete(`/collab/${c.id}`); toast.success('Collaborator removed'); load() } catch (e) { toast.error(errMsg(e)) }
  }

  return (
    <Modal open onClose={onClose} title={`Collaborators - ${item.name}`}>
      <form onSubmit={invite} className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" type="email" required placeholder="Invite by email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Collaborator email" />
        <select className="input !w-auto" value={perm} onChange={(e) => setPerm(e.target.value)} aria-label="Permission">
          <option value="viewer">Read-only</option><option value="editor">Editor</option>
        </select>
        <button className="btn-primary" disabled={busy}>{busy ? <Spinner size={16} /> : <UserPlus size={16} />}Invite</button>
      </form>
      <p className="mt-2 text-xs text-muted">Read-only collaborators can view and download. Editors can also upload, rename, move and delete inside the shared folder.</p>
      <h3 className="mb-2 mt-5 font-bold">People with access</h3>
      {list === null ? <Spinner /> : list.length === 0 ? <p className="text-sm text-muted">Only you have access.</p> : (
        <ul className="divide-y divide-line">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
              <Avatar user={c.user} size={32} />
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{c.user.full_name}</p><p className="truncate text-xs text-muted">{c.user.email}{c.status === 'pending' && ' - invitation pending'}</p></div>
              <select className="input !w-auto !py-1" value={c.permission} onChange={(e) => change(c, e.target.value)} aria-label={`Permission for ${c.user.username}`}>
                <option value="viewer">Read-only</option><option value="editor">Editor</option>
              </select>
              <button className="btn-quiet !p-1.5 text-danger" onClick={() => remove(c)} aria-label={`Remove ${c.user.username}`}><Trash2 size={16} /></button>
            </li>))}
        </ul>)}
    </Modal>
  )
}
