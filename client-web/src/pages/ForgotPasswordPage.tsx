export default function ForgotPasswordPage() {
  return (
    <div className="card">
      <h1>Restore password</h1>
      <label>E-mail</label>
      <input placeholder="mail@gmail.com" />
      <button>Send e-mail</button>
      <a href="/login">Log in</a>
    </div>
  )
}
