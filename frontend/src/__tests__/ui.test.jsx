import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ContextMenu from '../components/ContextMenu'
import { ConfirmDialog, EmptyState, Modal, PromptDialog, StorageBar } from '../components/ui'

describe('StorageBar', () => {
  it('shows usage and exposes progress semantics', () => {
    render(<StorageBar used={256 * 1024 ** 2} quota={1024 ** 3} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByText(/256.0 MB of 1.0 GB used/)).toBeInTheDocument()
  })
  it('caps at 100%', () => {
    render(<StorageBar used={5} quota={2} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })
})

describe('dialogs', () => {
  it('ConfirmDialog calls handlers', async () => {
    const onConfirm = vi.fn(), onCancel = vi.fn()
    render(<ConfirmDialog open title="Delete?" message="Sure?" confirmLabel="Yes, delete" onConfirm={onConfirm} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
  it('Modal closes on Escape and renders nothing when closed', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<Modal open onClose={onClose} title="T">body</Modal>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
    rerender(<Modal open={false} onClose={onClose} title="T">body</Modal>)
    expect(screen.queryByText('body')).not.toBeInTheDocument()
  })
  it('PromptDialog submits trimmed value', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    render(<PromptDialog open title="New folder" label="Name" confirmLabel="Create" onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText('Name'), '  Reports ')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).toHaveBeenCalledWith('Reports')
  })
})

describe('EmptyState / ContextMenu', () => {
  it('renders title, text and action', () => {
    render(<EmptyState title="Nothing here" text="Upload something" action={<button>Go</button>} />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
  })
  it('context menu runs the chosen action, skips hidden items', async () => {
    const a = vi.fn(), b = vi.fn(), close = vi.fn()
    render(<ContextMenu pos={{ x: 10, y: 10 }} onClose={close} items={[{ label: 'Rename', onClick: a }, { label: 'Secret', onClick: b, hidden: true }]} />)
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(a).toHaveBeenCalled(); expect(close).toHaveBeenCalled(); expect(b).not.toHaveBeenCalled()
  })
})
