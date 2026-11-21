import axios from 'axios'

export const baseURL = import.meta.env.VITE_API_URL || '/api'
export const api = axios.create({ baseURL })

// NOTE: tokens live in localStorage (simple, works for SPAs). Because they are sent in the Authorization header
// and never in cookies, the API is not vulnerable to CSRF. Keep your CSP strict to limit XSS exposure.
export const session = {
  get access() { return localStorage.getItem('cv_access') },
  get refresh() { return localStorage.getItem('cv_refresh') },
  set(access, refresh) {
    localStorage.setItem('cv_access', access)
    if (refresh) localStorage.setItem('cv_refresh', refresh)
  },
  clear() { localStorage.removeItem('cv_access'); localStorage.removeItem('cv_refresh') },
}

api.interceptors.request.use((cfg) => {
  const t = session.access
  if (t && !cfg.headers.Authorization && !cfg.noAuth) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

let refreshing = null
const NO_REFRESH = /^\/(auth\/(login|register|refresh|forgot-password|reset-password|verify-email)|public\/)/

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const orig = err.config
    const skip = !orig || orig.noAuth || NO_REFRESH.test(orig.url || '')
    if (err.response?.status === 401 && !skip) {
      const code = err.response?.data?.code
      if (!orig._retry && session.refresh && code !== 'token_revoked') {
        orig._retry = true
        try {
          refreshing = refreshing || axios
            .post(`${baseURL}/auth/refresh`, {}, { headers: { Authorization: `Bearer ${session.refresh}` } })
            .finally(() => { refreshing = null })
          const { data } = await refreshing
          session.set(data.access_token)
          orig.headers.Authorization = `Bearer ${data.access_token}`
          return api(orig)
        } catch { /* fall through to logout */ }
      }
      session.clear()
      window.dispatchEvent(new Event('cv:logout'))
    }
    return Promise.reject(err)
  },
)

export function errMsg(e) {
  return e?.response?.data?.error || (e?.code === 'ERR_CANCELED' ? 'Cancelled' : e?.message) || 'Something went wrong'
}

// Blob requests return errors as Blobs - turn them back into a readable message.
async function blobError(e) {
  const d = e?.response?.data
  if (d instanceof Blob) {
    try { e.response.data = JSON.parse(await d.text()) } catch { /* keep as is */ }
  }
  return e
}

export async function blobUrl(path, config = {}) {
  try {
    const r = await api.get(path, { responseType: 'blob', ...config })
    return URL.createObjectURL(r.data)
  } catch (e) { throw await blobError(e) }
}

function filenameFrom(headers, fallback) {
  const cd = headers?.['content-disposition'] || ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (star) return decodeURIComponent(star[1])
  const plain = /filename="?([^";]+)"?/i.exec(cd)
  return plain ? plain[1] : fallback
}

export async function downloadFile(path, fallbackName = 'download', config = {}) {
  try {
    const r = await api.get(path, { responseType: 'blob', ...config })
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url
    a.download = filenameFrom(r.headers, fallbackName)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  } catch (e) { throw await blobError(e) }
}
