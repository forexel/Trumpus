import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession } from '../lib/api'

export default function GoogleCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    getSession().finally(() => {
      navigate('/chats', { replace: true })
    })
  }, [navigate])

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
