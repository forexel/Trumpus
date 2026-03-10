import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function LandingPage() {
  useEffect(() => {
    document.title = 'Trumpus - AI Chat App'
  }, [])

  return (
    <section className="landing-page">
      <div className="landing-hero">
        <h1>Trumpus AI Chats</h1>
        <p>
          Trumpus is a web app where you can create AI chats, keep conversation history,
          and continue dialogs from any device.
        </p>
        <div className="landing-actions">
          <Link to="/register" className="landing-btn primary">Create Account</Link>
          <Link to="/login" className="landing-btn secondary">Sign In</Link>
        </div>
      </div>

      <div className="landing-grid">
        <article className="landing-card">
          <h2>Fast Start</h2>
          <p>Register, open a new chat, and get the first AI response in a few clicks.</p>
        </article>
        <article className="landing-card">
          <h2>Chat History</h2>
          <p>All messages are saved in your account so you can return anytime.</p>
        </article>
        <article className="landing-card">
          <h2>Multi Persona</h2>
          <p>Use different assistant personas for brainstorming and daily tasks.</p>
        </article>
      </div>
    </section>
  )
}
