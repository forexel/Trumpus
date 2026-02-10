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
  const [viewportDebug, setViewportDebug] = useState<string[]>([])
  const [debugViewport, setDebugViewport] = useState(false)
  const homeRedirect = getLastChatId() ? `/chats/${getLastChatId()}` : '/chats'

  useEffect(() => {
    const fromQuery = new URLSearchParams(location.search).get('debugViewport') === '1'
    let fromStorage = false
    try {
      fromStorage = window.localStorage.getItem('debugViewport') === '1'
    } catch {
      fromStorage = false
    }
    setDebugViewport(fromQuery || fromStorage)
  }, [location.search])

  const toggleDebugViewport = () => {
    const next = !debugViewport
    setDebugViewport(next)
    try {
      if (next) {
        window.localStorage.setItem('debugViewport', '1')
      } else {
        window.localStorage.removeItem('debugViewport')
      }
    } catch {
      // noop
    }
  }

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

  useEffect(() => {
    if (!debugViewport) {
      setViewportDebug([])
      return
    }

    const updateDebug = () => {
      const rootStyle = getComputedStyle(document.documentElement)
      const appVh = rootStyle.getPropertyValue('--app-vh').trim()
      const kbOffset = rootStyle.getPropertyValue('--kb-offset').trim()
      const vv = window.visualViewport
      const header = document.querySelector('.mobile-header') as HTMLElement | null
      const messages = document.querySelector('.chat-messages') as HTMLElement | null
      const composer = document.querySelector('.composer-bottom') as HTMLElement | null
      const active = document.activeElement

      const headerRect = header?.getBoundingClientRect()
      const messagesRect = messages?.getBoundingClientRect()
      const composerRect = composer?.getBoundingClientRect()

      const bottomGap = composerRect ? Math.round(window.innerHeight - composerRect.bottom) : null
      const middleGap = composerRect && messagesRect ? Math.round(composerRect.top - messagesRect.bottom) : null

      setViewportDebug([
        `path: ${location.pathname}`,
        `innerHeight: ${Math.round(window.innerHeight)}`,
        `app-vh: ${appVh || '-'}`,
        `kb-offset: ${kbOffset || '-'}`,
        `vv.h: ${vv ? Math.round(vv.height) : '-'}`,
        `vv.top: ${vv ? Math.round(vv.offsetTop) : '-'}`,
        `header.top: ${headerRect ? Math.round(headerRect.top) : '-'}`,
        `header.h: ${headerRect ? Math.round(headerRect.height) : '-'}`,
        `messages.top: ${messagesRect ? Math.round(messagesRect.top) : '-'}`,
        `messages.bottom: ${messagesRect ? Math.round(messagesRect.bottom) : '-'}`,
        `composer.top: ${composerRect ? Math.round(composerRect.top) : '-'}`,
        `composer.bottom: ${composerRect ? Math.round(composerRect.bottom) : '-'}`,
        `gap bottom: ${bottomGap ?? '-'}`,
        `gap middle: ${middleGap ?? '-'}`,
        `focus: ${active ? (active as HTMLElement).tagName.toLowerCase() : '-'}`
      ])
    }

    updateDebug()
    const vv = window.visualViewport
    const timer = window.setInterval(updateDebug, 250)
    vv?.addEventListener('resize', updateDebug)
    vv?.addEventListener('scroll', updateDebug)
    window.addEventListener('resize', updateDebug)
    window.addEventListener('scroll', updateDebug)
    document.addEventListener('focusin', updateDebug)
    document.addEventListener('focusout', updateDebug)

    return () => {
      window.clearInterval(timer)
      vv?.removeEventListener('resize', updateDebug)
      vv?.removeEventListener('scroll', updateDebug)
      window.removeEventListener('resize', updateDebug)
      window.removeEventListener('scroll', updateDebug)
      document.removeEventListener('focusin', updateDebug)
      document.removeEventListener('focusout', updateDebug)
    }
  }, [debugViewport, location.pathname])

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
      {debugViewport ? (
        <pre
          style={{
            position: 'fixed',
            right: 8,
            top: 8,
            zIndex: 9999,
            margin: 0,
            padding: '8px 10px',
            maxWidth: '70vw',
            fontSize: 11,
            lineHeight: 1.3,
            color: '#9ef',
            background: 'rgba(0,0,0,0.78)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap'
          }}
        >
          {viewportDebug.join('\n')}
        </pre>
      ) : null}
      {isMobileRoute ? (
        <button
          type="button"
          onClick={toggleDebugViewport}
          style={{
            position: 'fixed',
            right: 8,
            bottom: 8,
            zIndex: 9999,
            height: 28,
            minWidth: 44,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.35)',
            background: debugViewport ? 'rgba(0,120,255,0.9)' : 'rgba(0,0,0,0.7)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            padding: '0 10px'
          }}
        >
          DBG
        </button>
      ) : null}
    </div>
  )
}
