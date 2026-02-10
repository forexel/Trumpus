import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession } from '../lib/api'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1'

export default function GoogleCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')

    // If Google was configured to redirect to the SPA callback by mistake,
    // forward the original query to API callback so token exchange can complete.
    if (code && state) {
      const callbackURL = new URL(`${API_BASE}/auth/google/callback`, window.location.origin)
      callbackURL.searchParams.set('code', code)
      callbackURL.searchParams.set('state', state)
      const scope = params.get('scope')
      if (scope) callbackURL.searchParams.set('scope', scope)
      const authuser = params.get('authuser')
      if (authuser) callbackURL.searchParams.set('authuser', authuser)
      const prompt = params.get('prompt')
      if (prompt) callbackURL.searchParams.set('prompt', prompt)
      window.location.replace(callbackURL.toString())
      return
    }

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
