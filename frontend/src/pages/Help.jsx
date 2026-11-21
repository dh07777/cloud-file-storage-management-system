import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { api, errMsg } from '../api'
import PublicShell from '../components/PublicShell'
import { Field, PageHeader, Spinner } from '../components/ui'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { formatDate } from '../utils'

const FAQ = [
  ['How do I upload files?', 'Open My Files and drag files onto the page, or press Upload. You can cancel any upload from the progress panel.'],
  ['How do I share a file?', 'Open the menu on a file or folder and choose "Share link". You can set a password, an expiry date, and allow view-only or download access. Revoke a link at any time from Shared by me.'],
  ['What happens when I delete a file?', 'It moves to Trash and can be restored until the retention period ends. Items in Trash still count toward your storage until permanently deleted.'],
  ['How do versions work?', 'Use "Upload new version" on a file. Older versions are kept so you can preview, download, compare or restore them.'],
  ['Who can see my files?', 'Only you, plus people you explicitly invite or share with. Administrators cannot read your file contents.'],
  ['I forgot my password', 'Use "Forgot password" on the sign-in page and follow the emailed link.'],
]

function Body({ standalone }) {
  const { user } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(0)
  const [f, setF] = useState({ subject: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [tickets, setTickets] = useState(null)
  const load = () => user && api.get('/support').then((r) => setTickets(r.data.items)).catch(() => {})
  useEffect(() => { load() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e) => {
    e.preventDefault(); setBusy(true)
    try { await api.post('/support', f); toast.success('Message sent - we will get back to you'); setF({ subject: '', message: '' }); load() }
    catch (e2) { toast.error(errMsg(e2)) } finally { setBusy(false) }
  }
  return (
    <div className={standalone ? 'mx-auto max-w-3xl' : ''}>
      {standalone ? <h1 className="mb-6 text-3xl font-bold">Help and support</h1> : <PageHeader title="Help and support" subtitle="Answers to common questions, or contact an administrator." />}
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Frequently asked questions" className="space-y-2">
          <h2 className="text-lg font-bold">Frequently asked questions</h2>
          {FAQ.map(([q, a], i) => (
            <div key={q} className="card">
              <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                {q}<ChevronDown size={16} className={`shrink-0 transition ${open === i ? 'rotate-180' : ''}`} /></button>
              {open === i && <p className="px-4 pb-4 text-sm text-muted">{a}</p>}
            </div>))}
        </section>
        <section aria-label="Contact support">
          <h2 className="mb-2 text-lg font-bold">Contact support</h2>
          {user ? (
            <form onSubmit={submit} className="card space-y-4 p-5">
              <Field label="Subject" htmlFor="hs"><input id="hs" className="input" required minLength={3} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
              <Field label="How can we help?" htmlFor="hm"><textarea id="hm" rows={5} className="input" required minLength={10} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
              <button className="btn-primary" disabled={busy}>{busy && <Spinner size={16} />}Send message</button>
            </form>
          ) : <div className="card p-5 text-sm"><p><Link className="font-semibold text-brand underline" to="/login">Sign in</Link> to contact support.</p></div>}
          {tickets?.length > 0 && (
            <div className="mt-5"><h3 className="mb-2 font-bold">Your requests</h3>
              <ul className="space-y-2">{tickets.map((t) => <li key={t.id} className="card flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span className="truncate font-semibold">{t.subject}</span><span className="chip shrink-0">{t.status} - {formatDate(t.created_at)}</span></li>)}</ul></div>)}
        </section>
      </div>
    </div>
  )
}

export default function Help({ standalone = false }) {
  return standalone ? <PublicShell><Body standalone /></PublicShell> : <Body />
}
