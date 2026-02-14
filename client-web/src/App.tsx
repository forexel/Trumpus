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
    const checkSession = () => getSession()

    checkSession()
      .then((data) => {
        if (active) setAuthed(Boolean(data?.client_id))
      })
      .catch(() => {
        if (active) setAuthed(false)
      })
      .finally(() => {
        if (active) setSessionReady(true)
      })

    const onFocus = () => {
      checkSession()
        .then((data) => {
          if (active) setAuthed(Boolean(data?.client_id))
        })
        .catch(() => {
          if (active) setAuthed(false)
        })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [location.pathname])

  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport

    const updateAppHeight = () => {
      const viewportHeight = vv ? vv.height + vv.offsetTop : window.innerHeight
      root.style.setProperty('--app-vh', `${Math.round(viewportHeight)}px`)
      root.style.setProperty('--vv-top', `${Math.round(vv?.offsetTop ?? 0)}px`)
    }

    const updateKeyboardOffset = () => {
      if (!vv) {
        root.style.setProperty('--kb-offset', '0px')
        return
      }
      const active = document.activeElement as HTMLElement | null
      const editing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        Boolean(active?.isContentEditable)
      if (!editing) {
        root.style.setProperty('--kb-offset', '0px')
        return
      }
      const viewportBottom = vv.height + vv.offsetTop
      const rawInset = Math.max(0, window.innerHeight - viewportBottom)
      const keyboardOffset = rawInset > 140 ? rawInset : 0
      root.style.setProperty('--kb-offset', `${Math.round(keyboardOffset)}px`)
    }

    updateAppHeight()
    updateKeyboardOffset()
    vv?.addEventListener('resize', updateAppHeight)
    vv?.addEventListener('scroll', updateAppHeight)
    vv?.addEventListener('resize', updateKeyboardOffset)
    vv?.addEventListener('scroll', updateKeyboardOffset)
    window.addEventListener('orientationchange', updateAppHeight)
    window.addEventListener('resize', updateAppHeight)
    document.addEventListener('focusin', updateKeyboardOffset)
    document.addEventListener('focusout', updateKeyboardOffset)
    return () => {
      vv?.removeEventListener('resize', updateAppHeight)
      vv?.removeEventListener('scroll', updateAppHeight)
      vv?.removeEventListener('resize', updateKeyboardOffset)
      vv?.removeEventListener('scroll', updateKeyboardOffset)
      window.removeEventListener('orientationchange', updateAppHeight)
      window.removeEventListener('resize', updateAppHeight)
      document.removeEventListener('focusin', updateKeyboardOffset)
      document.removeEventListener('focusout', updateKeyboardOffset)
    }
  }, [])

  const isMobileRoute =
    location.pathname === '/' ||
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/forgot') ||
    location.pathname.startsWith('/forgot-password') ||
    location.pathname.startsWith('/register') ||
    location.pathname.startsWith('/create-account') ||
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
          <Route path="/forgot-password" element={authed ? <Navigate to={homeRedirect} replace /> : <ForgotPasswordPage />} />
          <Route path="/register" element={authed ? <Navigate to={homeRedirect} replace /> : <RegisterPage />} />
          <Route path="/create-account" element={authed ? <Navigate to={homeRedirect} replace /> : <RegisterPage />} />
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
