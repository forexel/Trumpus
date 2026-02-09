import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getAccessToken, getLastChatId, getSession } from './lib/api'
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
  const hasLocalToken = Boolean(getAccessToken())
  const homeRedirect = getLastChatId() ? `/chats/${getLastChatId()}` : '/chats'

  useEffect(() => {
    let active = true
    setSessionReady(false)
    if (!hasLocalToken) {
      setAuthed(false)
      setSessionReady(true)
      return () => {
        active = false
      }
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
  }, [location.pathname, hasLocalToken])
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
              authed
                ? <Navigate to={homeRedirect} replace />
                : <Navigate to="/login" replace />
            }
          />
          <Route path="/login" element={authed ? <Navigate to={homeRedirect} replace /> : <LoginPage />} />
          <Route path="/forgot" element={authed ? <Navigate to={homeRedirect} replace /> : <ForgotPasswordPage />} />
          <Route path="/register" element={authed ? <Navigate to={homeRedirect} replace /> : <RegisterPage />} />
          <Route path="/reset" element={authed ? <Navigate to={homeRedirect} replace /> : <ResetPasswordPage />} />
          <Route path="/reset-password" element={authed ? <Navigate to={homeRedirect} replace /> : <ResetPasswordPage />} />
          <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
          <Route path="/auth/google/callback/*" element={<GoogleCallbackPage />} />
          <Route path="/chats" element={authed ? <ChatsPage /> : <Navigate to="/login" replace />} />
          <Route path="/chats/new" element={authed ? <NewChatPage /> : <Navigate to="/login" replace />} />
          <Route path="/chats/:id" element={authed ? <ChatDetailPage /> : <Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  )
}
