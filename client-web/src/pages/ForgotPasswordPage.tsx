import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { forgotPassword } from '../lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email) {
      setError('Fill all fields')
      return
    }
    try {
      setLoading(true)
      await forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-overlay" />
      <div className="auth-content">
        <div className="auth-brand">Trumpus</div>
        <div className="auth-card">
          <h1>Restore password</h1>
          <form onSubmit={onSubmit} className="form">
            <label>E-mail</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mail@gmail.com" />
            {error ? <div className="error">{error}</div> : null}
            {sent ? <div className="hint">Check your email for the reset link.</div> : null}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send e-mail'}
            </button>
            <div className="auth-links">
              <button type="button" className="linkish" onClick={() => navigate('/login')}>
                Log in
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
