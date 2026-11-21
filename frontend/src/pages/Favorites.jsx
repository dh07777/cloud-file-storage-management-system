import { useCallback, useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { api, errMsg } from '../api'
import { GridView, ListView, ViewToggle, useViewPref } from '../components/FileBrowser'
import useItemActions from '../components/useItemActions'
import { EmptyState, PageHeader, SkeletonGrid } from '../components/ui'
import { useToast } from '../context/Toast'

export default function Favorites() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [view, setView] = useViewPref()
  const load = useCallback(() => api.get('/favorites').then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e))), [toast])
  useEffect(() => { load() }, [load])
  const actions = useItemActions(load)
  const items = data ? [...data.folders, ...data.files] : []
  return (
    <>
      <PageHeader title="Favorites" subtitle="Quick access to the files and folders you starred."><ViewToggle view={view} setView={setView} /></PageHeader>
      {!data ? <SkeletonGrid n={4} /> : items.length === 0 ? <EmptyState icon={Star} title="No favorites yet" text="Open the menu on any file or folder and choose Add to favorites." />
        : view === 'grid' ? <GridView items={items} onOpen={actions.open} onMenu={actions.openMenu} /> : <ListView items={items} onOpen={actions.open} onMenu={actions.openMenu} />}
      {actions.modals}
    </>
  )
}
