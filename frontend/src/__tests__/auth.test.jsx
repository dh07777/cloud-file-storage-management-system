import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => {
  const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
  return {
    api, baseURL: '/api', blobUrl: vi.fn(), downloadFile: vi.fn(),
    errMsg: (e) => e?.response?.data?.error || 'Something went wrong',
    session: { access: localStorage.getItem('cv_access'), refresh: null, set: vi.fn(), clear: vi.fn() },
  }
})
import { api } from '../api'
import { GuestRoute, ProtectedRoute } from '../components/Routes'
import { AuthProvider } from '../context/Auth'
import { ThemeProvider } from '../context/Theme'
import { ToastProvider } from '../context/Toast'
import Login from '../pages/Login'

const wrap = (ui, path = '/') => render(
  <MemoryRouter initialEntries={[path]}><ThemeProvider><ToastProvider><AuthProvider>{ui}</AuthProvider></ToastProvider></ThemeProvider></MemoryRouter>)

beforeEach(() => vi.clearAllMocks())

describe('route guards', () => {
  it('redirects anonymous visitors from /app to /login', async () => {
    wrap(<Routes><Route element={<ProtectedRoute />}><Route path="/app" element={<p>secret</p>} /></Route><Route path="/login" element={<p>login page</p>} /></Routes>, '/app')
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })
  it('lets anonymous visitors see guest routes', () => {
    wrap(<Routes><Route element={<GuestRoute />}><Route path="/login" element={<p>guest ok</p>} /></Route></Routes>, '/login')
    expect(screen.getByText('guest ok')).toBeInTheDocument()
  })
})

describe('Login page', () => {
  it('shows the server error for bad credentials', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Invalid email/username or password' } } })
    wrap(<Routes><Route path="/" element={<Login />} /></Routes>)
    await userEvent.type(screen.getByLabelText('Email or username'), 'alice')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email/username or password')
  })
  it('sends the typed credentials', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'x' } } })
    wrap(<Routes><Route path="/" element={<Login />} /></Routes>)
    await userEvent.type(screen.getByLabelText('Email or username'), 'alice')
    await userEvent.type(screen.getByLabelText('Password'), 'Alice@12345')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/login', { identifier: 'alice', password: 'Alice@12345' }, { noAuth: true }))
  })
})
