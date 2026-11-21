import { useEffect, useMemo, useState } from 'react'
import { Folder, Home } from 'lucide-react'
import { api, errMsg } from '../api'
import { useToast } from '../context/Toast'
import { Modal, Spinner } from './ui'

/** Pick a destination among the user's own folders. excludeId hides a folder + its subtree (for folder moves). */
export default function FolderPicker({ title, confirmLabel = 'Select', excludeId, onPick, onClose }) {
  const toast = useToast()
  const [all, setAll] = useState(null)
  const [sel, setSel] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get('/folders/tree').then((r) => setAll(r.data.items)).catch((e) => toast.error(errMsg(e))) }, [toast])

  const rows = useMemo(() => {
    if (!all) return []
    const kids = {}
    all.forEach((f) => { (kids[f.parent_id ?? 'root'] ||= []).push(f) })
    const out = []
    const walk = (pid, depth) => (kids[pid] || []).forEach((f) => {
      if (f.id === excludeId) return
      out.push({ ...f, depth }); walk(f.id, depth + 1)
    })
    walk('root', 0)
    return out
  }, [all, excludeId])

  const go = async () => { setBusy(true); try { await onPick(sel) } finally { setBusy(false) } }
  return (
    <Modal open onClose={onClose} title={title}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={go}>{busy && <Spinner size={14} />}{confirmLabel}</button></>}>
      {!all ? <Spinner /> : (
        <ul className="max-h-72 overflow-y-auto rounded-lg border border-line p-1" role="listbox" aria-label="Folders">
          <li><button role="option" aria-selected={sel === null} onClick={() => setSel(null)} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${sel === null ? 'bg-brand/15 font-semibold' : 'hover:bg-sunk'}`}><Home size={16} />My Files (top level)</button></li>
          {rows.map((f) => (
            <li key={f.id}><button role="option" aria-selected={sel === f.id} onClick={() => setSel(f.id)} style={{ paddingLeft: 12 + f.depth * 18 }}
              className={`flex w-full items-center gap-2 rounded-md py-2 pr-3 text-left text-sm ${sel === f.id ? 'bg-brand/15 font-semibold' : 'hover:bg-sunk'}`}><Folder size={16} className="text-brand" />{f.name}</button></li>))}
        </ul>)}
    </Modal>
  )
}
