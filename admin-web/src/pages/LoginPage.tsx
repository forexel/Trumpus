import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminLogin } from '../lib/api'

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await adminLogin(username.trim(), password)
      onLogin()
      navigate('/clients')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h1>Admin Login</h1>
      <form onSubmit={onSubmit} className="form">
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" />
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
        />
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
