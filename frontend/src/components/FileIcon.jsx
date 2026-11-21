import { Archive, Code2, File, FileAudio, FileImage, FileText, FileVideo, Folder, Sheet } from 'lucide-react'

const MAP = { image: FileImage, video: FileVideo, audio: FileAudio, archive: Archive, code: Code2, document: FileText, other: File }
const TONE = { image: 'text-emerald-500', video: 'text-violet-500', audio: 'text-pink-500', archive: 'text-amber-500', code: 'text-orange-500', document: 'text-blue-500', other: 'text-muted' }

export default function FileIcon({ item, size = 22 }) {
  if (item.type === 'folder') return <Folder size={size} className="fill-brand/20 text-brand" />
  const Icon = ['csv', 'xls', 'xlsx', 'ods'].includes(item.ext) ? Sheet : MAP[item.category] || File
  return <Icon size={size} className={TONE[item.category] || 'text-muted'} />
}
