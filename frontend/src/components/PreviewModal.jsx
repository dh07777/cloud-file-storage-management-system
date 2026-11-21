import { Link } from 'react-router-dom'
import { Download, ExternalLink } from 'lucide-react'
import { downloadFile } from '../api'
import { useToast } from '../context/Toast'
import { errMsg } from '../api'
import { formatBytes, formatDate } from '../utils'
import PreviewBody from './PreviewBody'
import { Modal } from './ui'

export default function PreviewModal({ file, onClose }) {
  const toast = useToast()
  if (!file) return null
  return (
    <Modal open onClose={onClose} title={file.name} wide
      footer={<>
        <span className="mr-auto self-center text-xs text-muted">{formatBytes(file.size)} - modified {formatDate(file.updated_at)}</span>
        <Link className="btn-ghost" to={`/app/file/${file.id}`} onClick={onClose}><ExternalLink size={16} />Details</Link>
        <button className="btn-primary" onClick={() => downloadFile(`/files/${file.id}/download`, file.name).catch((e) => toast.error(errMsg(e)))}><Download size={16} />Download</button>
      </>}>
      <PreviewBody file={file} />
    </Modal>
  )
}
