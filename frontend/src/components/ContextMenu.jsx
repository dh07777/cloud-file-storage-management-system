import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** items: [{label, icon, onClick, danger, divider, hidden}] ; pos: {x, y} */
export default function ContextMenu({ pos, items, onClose }) {
  const ref = useRef(null)
  const [at, setAt] = useState(pos)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAt({ x: Math.min(pos.x, window.innerWidth - r.width - 8), y: Math.min(pos.y, window.innerHeight - r.height - 8) })
  }, [pos])
  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    const esc = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', onClose, true); window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  return (
    <div ref={ref} role="menu" style={{ left: at.x, top: at.y }}
      className="pop card fixed z-[60] min-w-[13rem] max-w-[16rem] overflow-hidden py-1 text-sm">
      {items.filter((i) => !i.hidden).map((it, n) => it.divider
        ? <div key={n} className="my-1 border-t border-line" />
        : (
          <button key={n} role="menuitem" onClick={() => { onClose(); it.onClick() }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-sunk ${it.danger ? 'text-danger' : ''}`}>
            {it.icon && <it.icon size={16} className="shrink-0 opacity-80" />}{it.label}
          </button>
        ))}
    </div>
  )
}
