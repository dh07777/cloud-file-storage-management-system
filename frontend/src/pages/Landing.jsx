import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderTree, History, Link2, Lock, ShieldCheck, Users, UploadCloud, BarChart3 } from 'lucide-react'
import { api } from '../api'
import PublicShell from '../components/PublicShell'
import { formatBytes } from '../utils'

const FEATURES = [
  [UploadCloud, 'Drag, drop, done', 'Multi-file uploads with progress, cancellation and duplicate detection.'],
  [FolderTree, 'Organise anything', 'Nested folders, favorites, powerful search and a recoverable trash.'],
  [Link2, 'Share safely', 'Expiring, password-protected links with view-only or download access.'],
  [History, 'Version history', 'Every change is kept. Compare versions and roll back in one click.'],
  [Users, 'Collaborate', 'Invite people as read-only or editors to shared folders.'],
  [BarChart3, 'Know your storage', 'Analytics, large-file finder and cleanup suggestions.'],
]

export default function Landing() {
  const [stats, setStats] = useState(null)
  useEffect(() => { api.get('/public-stats').then((r) => setStats(r.data)).catch(() => {}) }, [])
  return (
    <PublicShell>
      <section className="py-10 text-center sm:py-16">
        <span className="chip mb-5 gap-1.5"><ShieldCheck size={13} />Private by design</span>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">Your files, locked in a vault you actually enjoy opening.</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">Upload, organise, preview and share files with granular permissions, version history and storage analytics.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/register" className="btn-primary !px-6 !py-3 text-base">Create free account</Link>
          <Link to="/login" className="btn-ghost !px-6 !py-3 text-base">Sign in</Link>
        </div>
        {stats && (
          <dl className="mx-auto mt-12 grid max-w-xl grid-cols-3 gap-4" aria-label="Platform statistics">
            {[['Members', stats.users], ['Files stored', stats.files], ['Data secured', formatBytes(stats.bytes_stored)]].map(([k, v]) => (
              <div key={k} className="card p-4"><dd className="font-display text-2xl font-bold">{v}</dd><dt className="text-xs text-muted">{k}</dt></div>))}
          </dl>)}
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Features">
        {FEATURES.map(([Icon, t, d]) => (
          <div key={t} className="card p-5"><div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-brand/15 text-brand"><Icon size={20} /></div>
            <h3 className="text-lg font-bold">{t}</h3><p className="mt-1 text-sm text-muted">{d}</p></div>))}
      </section>
      <section className="card mt-12 flex flex-col items-center gap-3 p-8 text-center">
        <Lock className="text-brand" /><h2 className="text-2xl font-bold">Security you can verify</h2>
        <p className="max-w-2xl text-sm text-muted">Hashed passwords, signed sessions, per-request authorization, validated uploads, unguessable server-side file ids, and temporary access tokens for shared links.</p>
      </section>
    </PublicShell>
  )
}
