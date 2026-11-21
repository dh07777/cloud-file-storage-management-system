import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { History, Search, SlidersHorizontal, X } from 'lucide-react'
import { api, errMsg } from '../api'
import { GridView, ListView, ViewToggle, useViewPref } from '../components/FileBrowser'
import useItemActions from '../components/useItemActions'
import { EmptyState, PageHeader, SkeletonGrid } from '../components/ui'
import { useToast } from '../context/Toast'

const EMPTY = { ext: '', type: '', from: '', to: '', min_size: '', max_size: '', sort: 'date', order: 'desc' }

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const toast = useToast()
  const [filters, setFilters] = useState(EMPTY)
  const [adv, setAdv] = useState(false)
  const [res, setRes] = useState(null)
  const [recent, setRecent] = useState([])
  const [view, setView] = useViewPref()
  const [text, setText] = useState(q)
  useEffect(() => setText(q), [q])

  const run = useCallback(() => {
    const p = Object.fromEntries(Object.entries({ q, ...filters }).filter(([, v]) => v !== ''))
    setRes(null)
    api.get('/search', { params: p }).then((r) => { setRes(r.data); api.get('/search/recent').then((x) => setRecent(x.data.items)).catch(() => {}) }).catch((e) => toast.error(errMsg(e)))
  }, [q, filters, toast])
  useEffect(() => { run() }, [run])
  const actions = useItemActions(run)
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value })
  const activeCount = Object.entries(filters).filter(([k, v]) => v && !['sort', 'order'].includes(k)).length
  const items = res ? [...res.folders, ...res.files] : []
  const clearHistory = async () => { await api.delete('/search/recent'); setRecent([]) }

  return (
    <>
      <PageHeader title="Search" subtitle={q ? `Results for "${q}"` : 'Find files by name, type, date or size.'}><ViewToggle view={view} setView={setView} /></PageHeader>
      <form onSubmit={(e) => { e.preventDefault(); setParams(text ? { q: text } : {}) }} className="flex flex-wrap gap-2" role="search">
        <div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-9" value={text} onChange={(e) => setText(e.target.value)} placeholder="File or folder name" aria-label="Search query" /></div>
        <button className="btn-primary">Search</button>
        <button type="button" className="btn-ghost" onClick={() => setAdv(!adv)} aria-expanded={adv}><SlidersHorizontal size={16} />Filters{activeCount > 0 && <span className="chip">{activeCount}</span>}</button>
      </form>
      {adv && (
        <div className="card mt-3 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium">Extension<input className="input mt-1" placeholder="pdf" value={filters.ext} onChange={set('ext')} /></label>
          <label className="text-sm font-medium">Type<select className="input mt-1" value={filters.type} onChange={set('type')}><option value="">Any</option>{['image', 'video', 'audio', 'document', 'archive', 'code', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="text-sm font-medium">Uploaded after<input type="date" className="input mt-1" value={filters.from} onChange={set('from')} /></label>
          <label className="text-sm font-medium">Uploaded before<input type="date" className="input mt-1" value={filters.to} onChange={set('to')} /></label>
          <label className="text-sm font-medium">Min size (MB)<input type="number" min="0" step="any" className="input mt-1" value={filters.min_size} onChange={set('min_size')} /></label>
          <label className="text-sm font-medium">Max size (MB)<input type="number" min="0" step="any" className="input mt-1" value={filters.max_size} onChange={set('max_size')} /></label>
          <label className="text-sm font-medium">Sort by<select className="input mt-1" value={filters.sort} onChange={set('sort')}><option value="date">Date</option><option value="name">Name</option><option value="size">Size</option><option value="type">Type</option></select></label>
          <label className="text-sm font-medium">Order<select className="input mt-1" value={filters.order} onChange={set('order')}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
          <div className="sm:col-span-2 lg:col-span-4"><button className="btn-quiet" onClick={() => setFilters(EMPTY)}><X size={14} />Reset filters</button></div>
        </div>)}
      {recent.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><History size={15} className="text-muted" /><span className="text-muted">Recent:</span>
          {recent.map((r) => <button key={r} className="chip hover:bg-brand/15" onClick={() => setParams({ q: r })}>{r}</button>)}
          <button className="text-xs text-muted underline" onClick={clearHistory}>Clear</button></div>)}
      <div className="mt-5">
        {!res ? <SkeletonGrid n={5} /> : items.length === 0 ? <EmptyState icon={Search} title="No matches" text="Try a different name or loosen your filters." />
          : <><p className="mb-3 text-sm text-muted">{res.total} file(s){res.folders.length ? ` and ${res.folders.length} folder(s)` : ''}</p>
            {view === 'grid' ? <GridView items={items} onOpen={actions.open} onMenu={actions.openMenu} /> : <ListView items={items} onOpen={actions.open} onMenu={actions.openMenu} />}</>}
      </div>
      {actions.modals}
    </>
  )
}
