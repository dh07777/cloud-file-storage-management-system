import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { GuestRoute, ProtectedRoute } from './components/Routes'
import About from './pages/About'
import AdminDashboard from './pages/AdminDashboard'
import ActivityLogs from './pages/ActivityLogs'
import Dashboard from './pages/Dashboard'
import Favorites from './pages/Favorites'
import FileDetails from './pages/FileDetails'
import FilePreview from './pages/FilePreview'
import { ForgotPassword, ResetPassword, VerifyEmail } from './pages/ForgotPassword'
import Help from './pages/Help'
import Landing from './pages/Landing'
import Login from './pages/Login'
import MyFiles from './pages/MyFiles'
import MyFolders from './pages/MyFolders'
import NotFound from './pages/NotFound'
import Notifications from './pages/Notifications'
import PublicShare from './pages/PublicShare'
import RecentFiles from './pages/RecentFiles'
import Register from './pages/Register'
import SearchPage from './pages/SearchPage'
import Settings from './pages/Settings'
import SharedByMe from './pages/SharedByMe'
import SharedWithMe from './pages/SharedWithMe'
import StorageAnalytics from './pages/StorageAnalytics'
import StorageManagement from './pages/StorageManagement'
import Trash from './pages/Trash'
import UserManagement from './pages/UserManagement'
import VersionHistory from './pages/VersionHistory'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/about" element={<About />} />
      <Route path="/help" element={<Help standalone />} />
      <Route path="/s/:token" element={<PublicShare />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="files" element={<MyFiles />} />
          <Route path="files/:folderId" element={<MyFiles />} />
          <Route path="folders" element={<MyFolders />} />
          <Route path="recent" element={<RecentFiles />} />
          <Route path="shared-with-me" element={<SharedWithMe />} />
          <Route path="shared-by-me" element={<SharedByMe />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="trash" element={<Trash />} />
          <Route path="storage" element={<StorageAnalytics />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="file/:id" element={<FileDetails />} />
          <Route path="file/:id/preview" element={<FilePreview />} />
          <Route path="file/:id/versions" element={<VersionHistory />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />
          <Route element={<ProtectedRoute adminOnly />}>
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="admin/users" element={<UserManagement />} />
            <Route path="admin/storage" element={<StorageManagement />} />
            <Route path="admin/activity" element={<ActivityLogs />} />
          </Route>
        </Route>
      </Route>
      <Route path="/dashboard" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
