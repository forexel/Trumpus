import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { register } from '../lib/api'

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
        <div className="auth-brand">Trumpus</div>
        <div className="auth-card">
          <h1>Sign in</h1>
          <form onSubmit={onSubmit} className="form">
            <label>E-mail</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mail@gmail.com" />
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            <button className="btn-primary" type="submit">
              {loading ? 'Loading...' : 'Sign In'}
            </button>
            <div className="auth-links">
              <button type="button" className="linkish" onClick={() => navigate('/login')}>
                Already got an account?
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
