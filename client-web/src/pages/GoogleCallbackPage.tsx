import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function GoogleCallbackPage() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const accessExpires = params.get('access_expires')
    const email = params.get('email')
    const clientId = params.get('client_id')
    if (accessToken && refreshToken) {
      localStorage.setItem('access_token', accessToken)
      localStorage.setItem('client_token', accessToken)
      localStorage.setItem('refresh_token', refreshToken)
      if (accessExpires) {
        localStorage.setItem('access_expires', accessExpires)
      }
    }
    if (email) {
      localStorage.setItem('client_email', email)
    }
    if (clientId) {
      localStorage.setItem('client_id', clientId)
    }
    navigate('/chats', { replace: true })
  }, [location.search, navigate])

  return (
    <div className="auth-screen">
      <div className="auth-overlay" />
      <div className="auth-content">
        <div className="auth-brand">Trumpus</div>
        <div className="auth-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div className="typing-dots" style={{ justifyContent: 'center', marginBottom: '16px' }}>
            <span />
            <span />
            <span />
          </div>
          <p style={{ margin: 0, color: '#374151' }}>Signing you in...</p>
        </div>
      </div>
    </div>
  )
}
