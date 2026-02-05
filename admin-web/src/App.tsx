import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ChatsPage from './pages/ChatsPage'
import ClientsPage from './pages/ClientsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import { getToken, clearToken } from './lib/api'

function RequireAuth({ children }: { children: JSX.Element }) {
  const location = useLocation()
  const token = getToken()
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

export default function App() {
  const token = getToken()
  return (
    <div className={token ? 'app' : 'app auth-only'}>
      {token ? (
        <aside className="sidebar">
          <div className="brand">Trumpus Admin</div>
          <nav>
            <Link to="/analytics">Analytics</Link>
            <Link to="/clients">Clients</Link>
            <Link to="/chats">Chats</Link>
            <button
              className="link-button"
              onClick={() => {
                clearToken()
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
          <Route path="/" element={<Navigate to={token ? '/clients' : '/login'} replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot" element={<ForgotPasswordPage />} />
          <Route
            path="/analytics"
            element={
              <RequireAuth>
                <AnalyticsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/clients"
            element={
              <RequireAuth>
                <ClientsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/chats"
            element={
              <RequireAuth>
                <ChatsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/chats/:id"
            element={
              <RequireAuth>
                <ChatsPage />
              </RequireAuth>
            }
          />
        </Routes>
      </main>
    </div>
  )
}
