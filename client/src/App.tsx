import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import { MessagesProvider } from './context/MessagesContext'
import { ReelProgressProvider } from './context/ReelProgressContext'
import AdminPage from './pages/AdminPage'
import LandingPage from './pages/LandingPage'
import HomePage from './pages/HomePage'
import BrowsePage from './pages/BrowsePage'
import PropertyPage from './pages/PropertyPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DashboardPage from './pages/DashboardPage'
import type { ReactNode } from 'react'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth()
  if (loading) return null
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Browse-first: the homepage shows properties, and the agent pitch lives at
          /for-agents. The listing endpoints were already public — only the interface
          was behind a login, so a shared property link led to a sign-in form rather
          than the property. */}
      <Route path="/" element={<HomePage />} />
      <Route path="/browse" element={<BrowsePage />} />
      <Route path="/property/:id" element={<PropertyPage />} />
      <Route path="/for-agents" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      {/* Staff only. ProtectedRoute keeps signed-out visitors at the login page; the
          page itself checks the role, and every endpoint behind it checks again. */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* A splat rather than a second route: /dashboard and /dashboard/property/:id
          must resolve to the same element instance, or moving between them would
          remount the shell and lose the open tab. */}
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <MessagesProvider>
          <ReelProgressProvider>
            <AppRoutes />
          </ReelProgressProvider>
        </MessagesProvider>
      </NotificationProvider>
    </AuthProvider>
  )
}