import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ChatsPage from './pages/ChatsPage'
import ClientsPage from './pages/ClientsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import { getAdminSession, adminLogout } from './lib/api'

function RequireAuth({ authed, children }: { authed: boolean; children: JSX.Element }) {
  const location = useLocation()
  if (!authed) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

export default function App() {
  const [sessionReady, setSessionReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  useEffect(() => {
    let active = true
    getAdminSession()
      .then(() => {
        if (active) setAuthed(true)
      })
      .catch(() => {
        if (active) setAuthed(false)
      })
      .finally(() => {
        if (active) setSessionReady(true)
      })
    return () => {
      active = false
    }
  }, [])
  if (!sessionReady) return null
  return (
    <div className={authed ? 'app' : 'app auth-only'}>
      {authed ? (
        <aside className="sidebar">
          <div className="brand">Trumpus Admin</div>
          <nav>
            <Link to="/analytics">Analytics</Link>
            <Link to="/clients">Clients</Link>
            <Link to="/chats">Chats</Link>
            <button
              className="link-button"
              onClick={async () => {
                await adminLogout()
                setAuthed(false)
                window.location.href = '/login'
              }}
            >
              Logout
            </button>
          </nav>
        </aside>
      ) : null}
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to={authed ? '/clients' : '/login'} replace />} />
          <Route path="/login" element={<LoginPage onLogin={() => setAuthed(true)} />} />
          <Route path="/forgot" element={<ForgotPasswordPage />} />
          <Route
            path="/analytics"
            element={
              <RequireAuth authed={authed}>
                <AnalyticsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/clients"
            element={
              <RequireAuth authed={authed}>
                <ClientsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/chats"
            element={
              <RequireAuth authed={authed}>
                <ChatsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/chats/:id"
            element={
              <RequireAuth authed={authed}>
                <ChatsPage />
              </RequireAuth>
            }
          />
        </Routes>
      </main>
    </div>
  )
}
