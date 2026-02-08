import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getAccessToken, getClientId, getLastChatId, getSession } from './lib/api'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ChatsPage from './pages/ChatsPage'
import ChatDetailPage from './pages/ChatDetailPage'
import GoogleCallbackPage from './pages/GoogleCallbackPage'
import NewChatPage from './pages/NewChatPage'
import RegisterPage from './pages/RegisterPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

export default function App() {
  const location = useLocation()
  const [sessionReady, setSessionReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const localAuthed = Boolean(getAccessToken())
  const canAccess = authed || localAuthed
  useEffect(() => {
    let active = true
    setSessionReady(false)
    if (localAuthed) {
      setAuthed(true)
      setSessionReady(true)
    }
    getSession()
      .then((data) => {
        if (active) setAuthed(Boolean(data?.client_id))
      })
      .finally(() => {
        if (active) setSessionReady(true)
      })
    return () => {
      active = false
    }
  }, [location.pathname])
  const isMobileRoute =
    location.pathname === '/' ||
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/forgot') ||
    location.pathname.startsWith('/register') ||
    location.pathname.startsWith('/reset') ||
    location.pathname.startsWith('/reset-password') ||
    location.pathname.startsWith('/auth/google/callback') ||
    location.pathname.startsWith('/chats')
  if (!sessionReady) return null
  return (
    <div className={isMobileRoute ? 'app auth-only' : 'app'}>
      {isMobileRoute ? null : (
        <header className="topbar">
          <div className="brand">Trumpus</div>
          <nav>
            <Link to="/login">Login</Link>
            <Link to="/forgot">Forgot</Link>
            <Link to="/chats">Chats</Link>
          </nav>
        </header>
      )}
      <main className="content">
        <Routes>
          <Route
            path="/"
            element={
              canAccess
                ? <Navigate to={getLastChatId() ? `/chats/${getLastChatId()}` : '/chats'} replace />
                : <Navigate to="/login" replace />
            }
          />
          <Route path="/login" element={canAccess ? <Navigate to="/chats" replace /> : <LoginPage />} />
          <Route path="/forgot" element={canAccess ? <Navigate to="/chats" replace /> : <ForgotPasswordPage />} />
          <Route path="/register" element={canAccess ? <Navigate to="/chats" replace /> : <RegisterPage />} />
          <Route path="/reset" element={canAccess ? <Navigate to="/chats" replace /> : <ResetPasswordPage />} />
          <Route path="/reset-password" element={canAccess ? <Navigate to="/chats" replace /> : <ResetPasswordPage />} />
          <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
          <Route path="/auth/google/callback/*" element={<GoogleCallbackPage />} />
          <Route path="/chats" element={canAccess ? <ChatsPage /> : <Navigate to="/login" replace />} />
          <Route path="/chats/new" element={canAccess ? <NewChatPage /> : <Navigate to="/login" replace />} />
          <Route path="/chats/:id" element={canAccess ? <ChatDetailPage /> : <Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  )
}
