import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { blobUrl } from '../api'
import { cn, formatBytes } from '../utils'

export function Spinner({ size = 18, className = '' }) {
  return <Loader2 size={size} className={cn('animate-spin', className)} aria-label="Loading" />
}

export function Skeleton({ className = '' }) { return <div className={cn('skeleton', className)} aria-hidden="true" /> }

export function SkeletonGrid({ n = 8 }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-testid="skeleton">
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-36" />)}
    </div>
  )
}

export function SkeletonRows({ n = 6 }) {
  return <div className="space-y-2" data-testid="skeleton">{Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
      {Icon && <div className="mb-4 rounded-full bg-sunk p-4 text-muted"><Icon size={28} /></div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function Modal({ open = true, onClose, title, children, wide = false, footer }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cn('pop card flex max-h-[92vh] w-full flex-col outline-none rounded-b-none sm:rounded-b-xl', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="truncate text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="btn-quiet !p-1.5"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel, busy }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}
      footer={<>
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
          {busy && <Spinner size={14} />}{confirmLabel}
        </button>
      </>}>
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  )
}

export function PromptDialog({ open, title, label, initial = '', confirmLabel = 'Save', onSubmit, onCancel }) {
  const [v, setV] = useState(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setV(initial) }, [open, initial])
  const submit = async (e) => {
    e?.preventDefault()
    if (!v.trim()) return
    setBusy(true)
    try { await onSubmit(v.trim()) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onCancel} title={title}
      footer={<><button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy || !v.trim()}>{busy && <Spinner size={14} />}{confirmLabel}</button></>}>
      <form onSubmit={submit}>
        <label className="label" htmlFor="prompt-input">{label}</label>
        <input id="prompt-input" className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} maxLength={150}
          onFocus={(e) => e.target.select()} />
      </form>
    </Modal>
  )
}

export function StorageBar({ used, quota, compact = false }) {
  const pct = quota ? Math.min(100, (used / quota) * 100) : 0
  const tone = pct >= 90 ? 'bg-danger' : pct >= 75 ? 'bg-warn' : 'bg-brand'
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-sunk" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn('mt-1.5 text-muted', compact ? 'text-xs' : 'text-sm')}>
        {formatBytes(used)} of {formatBytes(quota)} used{!compact && ` (${pct.toFixed(1)}%)`}
      </p>
    </div>
  )
}

const avatarCache = new Map()
export function Avatar({ user, size = 36 }) {
  const [src, setSrc] = useState(null)
  const id = user?.id
  const has = user?.has_avatar
  useEffect(() => {
    let alive = true
    setSrc(null)
    if (!id || !has) return
    const key = `${id}`
    const hit = avatarCache.get(key)
    if (hit && hit.expires > Date.now()) { setSrc(hit.url); return }
    blobUrl(`/users/${id}/avatar`).then((u) => { avatarCache.set(key, { url: u, expires: Date.now() + 60000 }); alive && setSrc(u) }).catch(() => {})
    return () => { alive = false }
  }, [id, has, user?.avatar_v])
  const initials = (user?.full_name || user?.username || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  if (src) return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand/15 font-bold text-brand"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</span>
  )
}
export const clearAvatarCache = () => avatarCache.clear()

export function Field({ label, children, hint, htmlFor }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function StatCard({ icon: Icon, label, value, sub, to }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm text-muted">{Icon && <Icon size={16} />}{label}</div>
      <div className="mt-2 font-display text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition',
            value === t.id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}{t.count != null && <span className="chip ml-2">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Pager({ page, total, perPage, onChange }) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  if (pages <= 1) return null
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>Page {page} of {pages} ({total} total)</span>
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
        <button className="btn-ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </div>
  )
}
