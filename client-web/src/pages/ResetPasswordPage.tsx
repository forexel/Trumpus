import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { resetPassword, resetPasswordWithOld } from '../lib/api'

export default function ResetPasswordPage() {
  const [emailInput, setEmailInput] = useState(() => localStorage.getItem('client_email') || '')
  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('token') || ''
  }, [])
  const hasToken = Boolean(token)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!newPass || !confirm || (!hasToken && (!emailInput || !oldPass))) {
      setError('Fill all fields')
      return
    }
    if (newPass !== confirm) {
      setError('Passwords do not match')
      return
    }
    try {
      setLoading(true)
      const data = hasToken
        ? await resetPassword(token, newPass)
        : await resetPasswordWithOld(emailInput, oldPass, newPass)
      void data
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
            {!hasToken ? (
              <>
                <label>E-mail</label>
                <input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="mail@gmail.com"
                />
                <label>Old password</label>
                <input
                  type="password"
                  value={oldPass}
                  onChange={(e) => setOldPass(e.target.value)}
                  placeholder="Enter your password"
                />
              </>
            ) : null}
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
