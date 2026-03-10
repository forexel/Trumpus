import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../lib/api'
import eagleIcon from '../assets/eagle.png'
import { trackEvent } from '../lib/analytics'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirm?: string }>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const nextErrors: { email?: string; password?: string; confirm?: string } = {}
    if (!email) nextErrors.email = 'Required'
    if (!password) nextErrors.password = 'Required'
    if (!confirm) nextErrors.confirm = 'Required'
    if (password && confirm && password !== confirm) {
      nextErrors.confirm = 'Passwords do not match'
    }
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }
    try {
      setLoading(true)
      const data = await register(email, password)
      void data
      trackEvent('signup_success', { method: 'password' })
      navigate('/chats')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
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
          <h1>Create your Trumpus account</h1>
          <p className="auth-subtitle">
            Join Trumpus to start AI character chats, save your conversation history, and explore persona-based
            conversations from any device.
          </p>
          <p className="auth-subtitle-small">
            Your account gives you access to saved chats, interactive AI dialogue, and a smoother multi-device experience.
          </p>
          <form onSubmit={onSubmit} className="form">
            <label>E-mail</label>
            <input
              className={fieldErrors.email ? 'input-error' : ''}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mail@gmail.com"
            />
            <div className="field-error">{fieldErrors.email ?? ''}</div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              className={fieldErrors.password ? 'input-error' : ''}
            />
            <div className="field-error">{fieldErrors.password ?? ''}</div>
            <label>Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm your password"
              className={fieldErrors.confirm ? 'input-error' : ''}
            />
            <div className="field-error">
              {fieldErrors.confirm || error ? fieldErrors.confirm || error : ''}
            </div>
            <div className="auth-actions">
              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </div>
          </form>
          <div className="auth-links">
            <span></span>
            <Link to="/login">Already have an account?</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
