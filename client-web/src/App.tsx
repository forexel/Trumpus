import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getLastChatId, getSession } from './lib/api'
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
  const homeRedirect = getLastChatId() ? `/chats/${getLastChatId()}` : '/chats'

  useEffect(() => {
    let active = true
    setSessionReady(false)
    getSession()
      .then((data) => {
        if (active) setAuthed(Boolean(data?.client_id))
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
  }, [location.pathname])

  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    if (!vv) {
      root.style.setProperty('--vvb', '0px')
      return
    }

    const updateViewportVars = () => {
      const rawInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      const keyboardInset = rawInset > 120 ? rawInset : 0
      root.style.setProperty('--vvb', `${Math.round(keyboardInset)}px`)
    }

    updateViewportVars()
    vv.addEventListener('resize', updateViewportVars)
    vv.addEventListener('scroll', updateViewportVars)
    window.addEventListener('orientationchange', updateViewportVars)
    return () => {
      vv.removeEventListener('resize', updateViewportVars)
      vv.removeEventListener('scroll', updateViewportVars)
      window.removeEventListener('orientationchange', updateViewportVars)
    }
  }, [])
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
