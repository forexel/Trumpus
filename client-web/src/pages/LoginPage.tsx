import { FormEvent, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login } from '../lib/api'
import googleIcon from '../assets/google.svg'
import appleIcon from '../assets/Apple_Icon.svg'
import googlePlayIcon from '../assets/GooglePlay_Icon.svg'
import eagleIcon from '../assets/eagle.png'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000/api/v1'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const nextErrors: { email?: string; password?: string } = {}
    if (!email) nextErrors.email = 'Required'
    if (!password) nextErrors.password = 'Required'
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }
    try {
      setLoading(true)
      const data = await login(email, password)
      if (data.access_token && data.refresh_token) {
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        if (data.access_expires) localStorage.setItem('access_expires', data.access_expires)
      }
      localStorage.setItem('client_email', data.email)
      localStorage.setItem('client_id', data.client_id)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-overlay" />
      <div className="auth-content">
        <img src={eagleIcon} alt="Eagle" className="auth-eagle" />
        <div className="auth-brand">
          <span className="auth-brand-text">Trumpus</span>
        </div>
        <div className="auth-card">
          <h1>Welcome Back</h1>
          <form onSubmit={onSubmit} className="form">
            <label>E-mail</label>
            <input
              className={fieldErrors.email ? 'input-error' : ''}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mail@gmail.com"
            />
            <div className="field-error">{fieldErrors.email ?? '\u00A0'}</div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className={fieldErrors.password ? 'input-error' : ''}
            />
            <div className="field-error">{fieldErrors.password || error ? (fieldErrors.password || error) : '\u00A0'}</div>
            <div className="auth-actions">
              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <div className="auth-divider">or</div>
              <a
                className="btn-google"
                href={`${API_BASE}/auth/google/start?redirect=${encodeURIComponent(
                  `${window.location.origin}/auth/google/callback`
                )}`}
              >
                <img src={googleIcon} alt="" aria-hidden="true" />
                Continue with Google
              </a>
            </div>
          </form>
          <div className="auth-links">
            <Link to="/forgot">Forgot password?</Link>
            <Link to="/register">Create account</Link>
          </div>
          <div className="store-buttons">
            <div className="store-button">
              <img src={appleIcon} alt="" aria-hidden="true" />
              <div className="store-text">
                <span className="store-label">App Store</span>
                <span className="store-sub">Coming soon</span>
              </div>
            </div>
            <div className="store-button">
              <img src={googlePlayIcon} alt="" aria-hidden="true" />
              <div className="store-text">
                <span className="store-label">Google Play</span>
                <span className="store-sub">Coming soon</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
