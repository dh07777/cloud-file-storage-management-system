import { useCallback, useEffect, useState } from 'react'
import { File, Folder, RotateCcw, Trash2 } from 'lucide-react'
import { api, errMsg } from '../api'
import { ConfirmDialog, EmptyState, PageHeader, SkeletonRows } from '../components/ui'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { formatBytes, formatDate } from '../utils'

export default function Trash() {
  const toast = useToast()
  const { refreshUser } = useAuth()
  const [data, setData] = useState(null)
  const [confirm, setConfirm] = useState(null) // {kind:'one'|'all', item}
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api.get('/trash').then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e))), [toast])
  useEffect(() => { load() }, [load])
  const after = (m) => { toast.success(m); load(); refreshUser().catch(() => {}) }
  const restore = async (t) => { try { await api.post('/trash/restore', { id: t.id }); after(`Restored ${t.name}`) } catch (e) { toast.error(errMsg(e)) } }
  const purge = async () => {
    setBusy(true)
    try { confirm.kind === 'all' ? await api.delete('/trash') : await api.delete(`/trash/${confirm.item.id}`); setConfirm(null); after('Permanently deleted') }
    catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHeader title="Trash" subtitle={data ? `${data.count} item(s) - ${formatBytes(data.total_size)}. Items are permanently deleted after ${data.retention_days} days.` : ''}>
        {data?.count > 0 && <button className="btn-danger" onClick={() => setConfirm({ kind: 'all' })}><Trash2 size={16} />Empty trash</button>}
      </PageHeader>
      {!data ? <SkeletonRows /> : data.items.length === 0 ? <EmptyState icon={Trash2} title="Trash is empty" text="Deleted files and folders wait here until you restore or permanently delete them." /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[34rem]"><thead className="border-b border-line"><tr><th className="th">Name</th><th className="th">Size</th><th className="th">Deleted</th><th className="th hidden sm:table-cell">Auto-delete</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-line">{data.items.map((t) => (
            <tr key={t.id}><td className="td"><span className="flex items-center gap-3">{t.item_type === 'folder' ? <Folder size={18} className="text-brand" /> : <File size={18} className="text-muted" />}<span className="font-semibold">{t.name}</span></span></td>
              <td className="td text-muted">{formatBytes(t.size)}</td><td className="td text-muted">{formatDate(t.deleted_at, true)}</td><td className="td hidden text-muted sm:table-cell">{formatDate(t.expires_at)}</td>
              <td className="td"><div className="flex justify-end gap-1"><button className="btn-ghost !py-1.5" onClick={() => restore(t)}><RotateCcw size={15} />Restore</button>
                <button className="btn-quiet !p-1.5 text-danger" aria-label={`Delete ${t.name} permanently`} onClick={() => setConfirm({ kind: 'one', item: t })}><Trash2 size={16} /></button></div></td></tr>))}</tbody></table></div>)}
      <ConfirmDialog open={!!confirm} danger busy={busy} title={confirm?.kind === 'all' ? 'Empty trash?' : 'Delete permanently?'} confirmLabel="Delete forever" onCancel={() => setConfirm(null)} onConfirm={purge}
        message={confirm?.kind === 'all' ? 'Everything in the trash, including all file versions, will be permanently deleted. This cannot be undone.' : `"${confirm?.item?.name}" and all of its versions will be permanently deleted. This cannot be undone.`} />
    </>
  )
}
