import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../lib/api'
import eagleIcon from '../assets/eagle.png'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email || !password || !confirm) {
      setError('Fill all fields')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    try {
      setLoading(true)
      const data = await register(email, password)
      localStorage.setItem('client_token', data.token)
      localStorage.setItem('client_email', data.email)
      localStorage.setItem('client_id', data.client_id)
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
          <h1>Create Account</h1>
          <form onSubmit={onSubmit} className="form">
            <label>E-mail</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mail@gmail.com" />
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
            />
            <label>Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm your password"
            />
            {error ? <div className="error">{error}</div> : null}
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
