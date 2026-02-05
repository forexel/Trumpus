import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string }>({})
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const nextErrors: { email?: string } = {}
    if (!email) nextErrors.email = 'Required'
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
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
            <input
              className={fieldErrors.email ? 'input-error' : ''}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mail@gmail.com"
            />
            <div className="field-error">
              {fieldErrors.email || error ? fieldErrors.email || error : '\u00A0'}
            </div>
            {sent ? <div className="hint">Check your email for the reset link.</div> : null}
            <div className="auth-actions">
              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Sending...' : 'Send e-mail'}
              </button>
            </div>
          </form>
          <div className="auth-links">
            <Link to="/login">Log in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
