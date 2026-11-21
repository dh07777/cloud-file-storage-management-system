import PublicShell from '../components/PublicShell'

const STACK = [['Frontend', 'React, React Router, Tailwind CSS, Axios, Recharts, Lucide'], ['Backend', 'Python, Flask, SQLAlchemy, Flask-JWT-Extended, Flask-Limiter, Pillow'],
  ['Database', 'SQLite (metadata only) via SQLAlchemy ORM'], ['Storage', 'Local filesystem behind an abstraction layer, optional S3-compatible backend']]

export default function About() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold">About CloudVault</h1>
        <p className="mt-4 text-lg text-muted">CloudVault is a secure cloud file storage platform: upload, organise, preview, share and version your files, with administrators able to manage users, quotas and activity.</p>
        <h2 className="mt-10 text-2xl font-bold">How it protects your data</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          <li>Files live on disk under random server-generated ids - never under the names you upload, and never behind public URLs.</li>
          <li>Every download is authorised against ownership, collaboration or share rules at request time.</li>
          <li>Uploads are checked for size, allowed type and matching file content, with a hook for malware scanning.</li>
          <li>Share links use unguessable tokens, can expire, be password protected, be revoked, and every access is logged.</li>
          <li>Administrators manage accounts and quotas but cannot read other users' file contents.</li>
        </ul>
        <h2 className="mt-10 text-2xl font-bold">Technology</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">{STACK.map(([k, v]) => <div key={k} className="card p-4"><dt className="font-bold">{k}</dt><dd className="mt-1 text-sm text-muted">{v}</dd></div>)}</dl>
      </div>
    </PublicShell>
  )
}
