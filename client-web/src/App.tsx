import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
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
  const token = localStorage.getItem('client_token')
  const isMobileRoute =
    location.pathname === '/' ||
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/forgot') ||
    location.pathname.startsWith('/register') ||
    location.pathname.startsWith('/reset-password') ||
    location.pathname.startsWith('/auth/google/callback') ||
    location.pathname.startsWith('/chats')
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
          <Route path="/" element={<Navigate to={token ? '/chats' : '/login'} replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot" element={<ForgotPasswordPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
          <Route path="/chats" element={token ? <ChatsPage /> : <Navigate to="/login" replace />} />
          <Route path="/chats/new" element={token ? <NewChatPage /> : <Navigate to="/login" replace />} />
          <Route path="/chats/:id" element={token ? <ChatDetailPage /> : <Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  )
}
