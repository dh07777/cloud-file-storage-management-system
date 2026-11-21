export function formatBytes(n, digits = 1) {
  if (n == null) return '-'
  if (n === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const v = n / 1024 ** i
  return `${i === 0 ? v : v.toFixed(digits)} ${units[i]}`
}

export function formatDate(iso, withTime = false) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString(undefined, withTime
    ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' })
}

export function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  const steps = [[60, 's'], [60, 'm'], [24, 'h'], [30, 'd'], [12, 'mo']]
  let v = s
  for (const [div, label] of steps) {
    if (v < div) return `${Math.floor(v)}${label} ago`
    v /= div
  }
  return `${Math.floor(v)}y ago`
}

export function formatDuration(sec) {
  if (!isFinite(sec)) return '-'
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export const CATEGORY_COLORS = {
  image: '#2dd4aa', video: '#a78bfa', audio: '#f472b6', document: '#60a5fa',
  archive: '#fbbf24', code: '#fb923c', other: '#94a3b8',
}

export const ACTION_LABELS = {
  'file.upload': 'uploaded', 'file.new_version': 'uploaded a new version of', 'file.rename': 'renamed',
  'file.move': 'moved', 'file.copy': 'copied', 'file.trash': 'moved to trash', 'file.download': 'downloaded',
  'file.version_restore': 'restored a version of', 'folder.create': 'created folder', 'folder.rename': 'renamed folder',
  'folder.move': 'moved folder', 'folder.trash': 'moved to trash folder', 'trash.restore': 'restored',
  'trash.purge': 'permanently deleted', 'share.create': 'shared', 'share.update': 'updated sharing for',
  'share.revoke': 'revoked sharing for', 'collab.invite': 'invited a collaborator to', 'collab.accept': 'joined',
  'collab.decline': 'declined', 'collab.remove': 'removed a collaborator from',
  'auth.login': 'signed in', 'auth.logout': 'signed out', 'auth.login_failed': 'failed to sign in',
  'user.register': 'registered', 'auth.password_changed': 'changed password',
}
export const actionLabel = (a) => ACTION_LABELS[a] || a.replace('.', ' ')

export function cn(...c) { return c.filter(Boolean).join(' ') }
