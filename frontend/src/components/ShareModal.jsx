import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Globe, Link2, Lock, Trash2, Users } from 'lucide-react'
import { api, errMsg } from '../api'
import { useToast } from '../context/Toast'
import { formatDate } from '../utils'
import { Field, Modal, Spinner } from './ui'

const EXPIRY = [['', 'Never'], ['1', '1 hour'], ['24', '24 hours'], ['168', '7 days'], ['720', '30 days']]

export default function ShareModal({ item, onClose, onChanged }) {
  const toast = useToast()
  const key = item.type === 'file' ? 'file_id' : 'folder_id'
  const [shares, setShares] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(null)
  const [form, setForm] = useState({ mode: 'public', emails: '', password: '', expiry: '168', allow_download: true })

  const load = useCallback(() => api.get('/shares/item', { params: { [key]: item.id } }).then((r) => setShares(r.data.items)).catch((e) => toast.error(errMsg(e))), [item.id, key, toast])
  useEffect(() => { load() }, [load])

  const create = async () => {
    setBusy(true)
    try {
      const body = {
        [key]: item.id, is_public: form.mode === 'public', allow_download: form.allow_download,
        expires_in_hours: form.expiry ? Number(form.expiry) : null,
      }
      if (form.password) body.password = form.password
      if (form.mode === 'private') body.user_emails = form.emails.split(/[,\s;]+/).filter(Boolean)
      const { data } = await api.post('/shares', body)
      await copy(data.share.url, data.share.id, true)
      setForm({ ...form, password: '', emails: '' })
      load(); onChanged?.()
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }

  const copy = async (url, id, created) => {
    try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 2000); toast.success(created ? 'Link created and copied to clipboard' : 'Link copied') }
    catch { toast.info(url) }
  }
  const revoke = async (s) => {
    try { await api.delete(`/shares/${s.id}`); toast.success('Link revoked'); load(); onChanged?.() } catch (e) { toast.error(errMsg(e)) }
  }

  return (
    <Modal open onClose={onClose} title={`Share "${item.name}"`} wide>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="font-bold">Create a link</h3>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who can open">
            {[['public', Globe, 'Anyone with the link'], ['private', Users, 'Specific people']].map(([m, Icon, label]) => (
              <button key={m} role="radio" aria-checked={form.mode === m} onClick={() => setForm({ ...form, mode: m })}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition ${form.mode === m ? 'border-brand bg-brand/10' : 'border-line hover:bg-sunk'}`}>
                <Icon size={18} className="text-brand" /><span className="font-semibold">{label}</span>
              </button>
            ))}
          </div>
          {form.mode === 'private' && (
            <Field label="CloudVault user emails" htmlFor="sh-emails" hint="They must sign in to open the link.">
              <input id="sh-emails" className="input" placeholder="bob@example.com, carol@example.com" value={form.emails} onChange={(e) => setForm({ ...form, emails: e.target.value })} />
            </Field>)}
          <Field label="Password (optional)" htmlFor="sh-pw">
            <input id="sh-pw" type="password" className="input" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Link expires" htmlFor="sh-exp">
            <select id="sh-exp" className="input" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })}>
              {EXPIRY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.allow_download} onChange={(e) => setForm({ ...form, allow_download: e.target.checked })} />
            Allow downloading <span className="text-muted">(otherwise view only)</span>
          </label>
          <button className="btn-primary w-full" disabled={busy || (form.mode === 'private' && !form.emails.trim())} onClick={create}>
            {busy ? <Spinner size={16} /> : <Link2 size={16} />}Create link
          </button>
        </div>
        <div>
          <h3 className="mb-3 font-bold">Active links</h3>
          {shares === null ? <Spinner /> : shares.length === 0 ? <p className="text-sm text-muted">No active links yet.</p> : (
            <ul className="space-y-3">
              {shares.map((s) => (
                <li key={s.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <input readOnly className="input !py-1.5 text-xs" value={s.url} onFocus={(e) => e.target.select()} aria-label="Share link" />
                    <button className="btn-ghost !px-2.5" onClick={() => copy(s.url, s.id)} aria-label="Copy link">{copied === s.id ? <Check size={16} /> : <Copy size={16} />}</button>
                    <button className="btn-ghost !px-2.5 text-danger" onClick={() => revoke(s)} aria-label="Revoke link"><Trash2 size={16} /></button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <span className="chip">{s.is_public ? 'Public' : `${s.users.length} user(s)`}</span>
                    {s.has_password && <span className="chip"><Lock size={11} className="mr-1" />Password</span>}
                    <span className="chip">{s.allow_download ? 'Download' : 'View only'}</span>
                    <span className="chip">{s.expires_at ? (s.expired ? 'Expired' : `Expires ${formatDate(s.expires_at, true)}`) : 'No expiry'}</span>
                    <span className="chip">{s.access_count} opens</span>
                  </div>
                </li>
              ))}
            </ul>)}
        </div>
      </div>
    </Modal>
  )
}
