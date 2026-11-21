import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }
const TONES = { success: 'text-ok', error: 'text-danger', info: 'text-brand' }

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const id = useRef(0)
  const dismiss = useCallback((i) => setItems((x) => x.filter((t) => t.id !== i)), [])
  const push = useCallback((type, message, ms = 4500) => {
    const i = ++id.current
    setItems((x) => [...x.slice(-3), { id: i, type, message }])
    setTimeout(() => dismiss(i), ms)
  }, [dismiss])
  const api = useMemo(() => ({
    success: (m) => push('success', m), error: (m) => push('error', m, 7000), info: (m) => push('info', m),
  }), [push])
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const Icon = ICONS[t.type]
          return (
            <div key={t.id} role="status" className="pop pointer-events-auto card flex items-start gap-3 p-3 text-sm">
              <Icon size={18} className={`mt-0.5 shrink-0 ${TONES[t.type]}`} />
              <p className="flex-1 break-words">{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted hover:text-ink"><X size={16} /></button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}
