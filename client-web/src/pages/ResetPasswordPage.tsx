import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { resetPassword } from '../lib/api'

export default function ResetPasswordPage() {
  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const email = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('email') || localStorage.getItem('client_email') || ''
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email) {
      setError('Email is missing')
      return
    }
    if (!oldPass || !newPass || !confirm) {
      setError('Fill all fields')
      return
    }
    if (newPass !== confirm) {
      setError('Passwords do not match')
      return
    }
    try {
      setLoading(true)
      const data = await resetPassword(email, oldPass, newPass)
      localStorage.setItem('client_token', data.token)
      localStorage.setItem('client_email', data.email)
      localStorage.setItem('client_id', data.client_id)
      navigate('/chats')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
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
            <label>Old password</label>
            <input
              type="password"
              value={oldPass}
              onChange={(e) => setOldPass(e.target.value)}
              placeholder="Enter your password"
            />
            <label>New password</label>
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="Enter your password"
            />
            <label>Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Enter your password"
            />
            {error ? <div className="error">{error}</div> : null}
            <div className="auth-actions">
              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Loading...' : 'Save'}
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
