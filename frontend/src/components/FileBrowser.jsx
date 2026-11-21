import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Star, Users } from 'lucide-react'
import { blobUrl } from '../api'
import { formatBytes, formatDate } from '../utils'
import FileIcon from './FileIcon'

function Thumb({ item }) {
  const ref = useRef(null)
  const [src, setSrc] = useState(null)
  const eligible = item.type === 'file' && item.category === 'image' && item.mime !== 'image/svg+xml' && item.size < 4 * 1024 * 1024
  useEffect(() => {
    if (!eligible || !ref.current) return
    let url, alive = true
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        io.disconnect()
        blobUrl(`/files/${item.id}/preview`).then((u) => { url = u; alive ? setSrc(u) : URL.revokeObjectURL(u) }).catch(() => {})
      }
    }, { rootMargin: '120px' })
    io.observe(ref.current)
    return () => { alive = false; io.disconnect(); if (url) URL.revokeObjectURL(url) }
  }, [eligible, item.id, item.size])
  return (
    <div ref={ref} className="flex h-24 items-center justify-center overflow-hidden rounded-lg bg-sunk">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <FileIcon item={item} size={34} />}
    </div>
  )
}

function Badges({ item }) {
  return (
    <>
      {item.is_favorite && <Star size={13} className="fill-warn text-warn" aria-label="Favorite" />}
      {item.permission && item.permission !== 'owner' && <span className="chip"><Users size={11} className="mr-1" />{item.permission}</span>}
    </>
  )
}

export function GridView({ items, onOpen, onMenu }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((it) => (
        <li key={`${it.type}-${it.id}`} onContextMenu={(e) => onMenu(e, it)}
          className="group relative rounded-xl border border-line bg-panel p-2.5 transition hover:border-brand/60 hover:shadow-card">
          <button onClick={() => onOpen(it)} className="block w-full text-left" aria-label={`${it.type === 'folder' ? 'Open folder' : 'Preview'} ${it.name}`}>
            <Thumb item={it} />
            <div className="mt-2 flex items-center gap-1.5 px-0.5">
              {it.type === 'folder' && <FileIcon item={it} size={16} />}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={it.name}>{it.name}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 px-0.5 text-xs text-muted">
              <span>{it.type === 'file' ? formatBytes(it.size) : 'Folder'}</span>
              <Badges item={it} />
            </div>
          </button>
          <button onClick={(e) => onMenu(e, it)} aria-label={`Actions for ${it.name}`} aria-haspopup="menu"
            className="absolute right-3 top-3 rounded-md bg-panel/90 p-1 text-muted opacity-100 shadow-sm hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">
            <MoreVertical size={16} />
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ListView({ items, onOpen, onMenu, showOwner = false }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[34rem]">
        <thead className="border-b border-line"><tr>
          <th className="th">Name</th>{showOwner && <th className="th">Owner</th>}<th className="th hidden sm:table-cell">Modified</th><th className="th">Size</th><th className="th w-10"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody className="divide-y divide-line">
          {items.map((it) => (
            <tr key={`${it.type}-${it.id}`} onContextMenu={(e) => onMenu(e, it)} className="hover:bg-sunk/60">
              <td className="td">
                <button onClick={() => onOpen(it)} className="flex max-w-full items-center gap-3 text-left">
                  <FileIcon item={it} /><span className="truncate font-semibold">{it.name}</span><Badges item={it} />
                </button>
              </td>
              {showOwner && <td className="td text-muted">{it.owner?.username}</td>}
              <td className="td hidden text-muted sm:table-cell">{formatDate(it.updated_at)}</td>
              <td className="td text-muted">{it.type === 'file' ? formatBytes(it.size) : '-'}</td>
              <td className="td"><button onClick={(e) => onMenu(e, it)} className="btn-quiet !p-1.5" aria-label={`Actions for ${it.name}`} aria-haspopup="menu"><MoreVertical size={16} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ViewToggle({ view, setView }) {
  const b = (v, label) => (
    <button onClick={() => setView(v)} aria-pressed={view === v}
      className={`px-3 py-1.5 text-sm font-semibold transition ${view === v ? 'bg-brand text-brand-fg' : 'text-muted hover:bg-sunk'}`}>{label}</button>
  )
  return <div className="inline-flex overflow-hidden rounded-lg border border-line bg-panel" role="group" aria-label="View">{b('grid', 'Grid')}{b('list', 'List')}</div>
}

export function useViewPref() {
  const [view, setView] = useState(() => localStorage.getItem('cv_view') || 'grid')
  return [view, (v) => { localStorage.setItem('cv_view', v); setView(v) }]
}
