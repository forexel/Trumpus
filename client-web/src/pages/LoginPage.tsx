import googleIcon from '../assets/icon-google.svg'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000/api/v1'

export default function LoginPage() {
  return (
    <div className="auth-screen">
      <div className="auth-overlay" />
      <div className="auth-content">
        <div className="auth-brand">Trumpus</div>
        <div className="auth-card">
          <h1>Log in</h1>
          <label>E-mail</label>
          <input placeholder="mail@gmail.com" />
          <label>Password</label>
          <input type="password" placeholder="Enter your password" />
          <div className="auth-actions">
            <button className="btn-primary">Log in</button>
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
          <div className="auth-links">
            <a href="/forgot">Forgot password?</a>
            <a href="/register">Sign up</a>
          </div>
        </div>
      </div>
    </div>
  )
}
