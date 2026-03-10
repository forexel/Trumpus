import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { trackEvent } from '../lib/analytics'

export default function LandingPage() {
  useEffect(() => {
    document.title = 'Trumpus - AI Chat App'
  }, [])

  return (
    <section className="landing-page">
      <div className="landing-hero">
        <h1>Trumpus AI Character Chats</h1>
        <p>
          Trumpus is a web app for AI character chats, persona-based conversations, and interactive assistant dialogue.
          Create a chat, explore unique AI personas, save conversation history, and continue from any device.
        </p>
        <div className="landing-actions">
          <Link
            to="/register"
            className="landing-btn primary"
            onClick={() => trackEvent('sign_up_click', { source: 'landing_hero' })}
          >
            Create Account
          </Link>
          <Link
            to="/login"
            className="landing-btn secondary"
            onClick={() => trackEvent('sign_in_click', { source: 'landing_hero' })}
          >
            Sign In
          </Link>
        </div>
      </div>

      <div className="landing-grid">
        <article className="landing-card">
          <h2>Fast Start</h2>
          <p>Create an AI chat in seconds and start talking with a unique assistant persona right away.</p>
        </article>
        <article className="landing-card">
          <h2>Chat History</h2>
          <p>Save your AI conversations and return to previous persona chats anytime from your account.</p>
        </article>
        <article className="landing-card">
          <h2>Multi Persona</h2>
          <p>Explore different AI personas for character chats, brainstorming, entertainment, and everyday conversations.</p>
        </article>
      </div>

      <section className="landing-section">
        <h2>What is Trumpus?</h2>
        <p>
          Trumpus is an AI conversation platform built for persona-driven chats. It helps users create interactive AI
          dialogues, continue saved conversations, and explore character-style assistants in one place.
        </p>
        <p>
          Whether you want a creative AI chat, a memorable assistant persona, or an entertaining character-style
          conversation, Trumpus makes it easy to start and continue from any device.
        </p>
      </section>

      <section className="landing-section">
        <h2>Why people use Trumpus</h2>
        <p>
          People use Trumpus for AI persona chats, creative conversations, interactive dialogue, brainstorming, and
          entertainment. The platform is designed for fast access to distinct AI personalities with saved history and
          simple account-based access.
        </p>
      </section>

      <section className="landing-section">
        <h2>What you can do with Trumpus</h2>
        <div className="landing-usecases">
          <article className="landing-subcard">
            <h3>Start persona-based conversations</h3>
            <p>Create AI chats with different personalities and explore how each assistant responds in its own style.</p>
          </article>
          <article className="landing-subcard">
            <h3>Continue conversations anytime</h3>
            <p>Your saved history makes it easy to come back to earlier chats and keep the dialogue going.</p>
          </article>
          <article className="landing-subcard">
            <h3>Use AI personas for different goals</h3>
            <p>
              Use Trumpus for entertainment, idea generation, roleplay-style dialogue, casual interaction, or everyday
              thinking support.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-section">
        <h2>About Trumpus</h2>
        <p>
          Trumpus is a product-focused team building conversational AI experiences around personas, interactive
          dialogue, and memorable character-based communication.
        </p>
        <p>
          We design tools that make AI chats more engaging, creative, and accessible across devices, with a focus on
          simple user experience, saved conversations, and scalable web-based interaction.
        </p>
        <p>
          Our work is centered on AI product design, conversational interfaces, and new ways for users to interact
          with digital personalities online.
        </p>
        <ul className="landing-facts">
          <li>Founded in 2025</li>
          <li>Product: web-based conversational AI platform</li>
          <li>Focus: persona-driven chat experiences</li>
          <li>Availability: browser-based access</li>
        </ul>
      </section>

      <section className="landing-section">
        <h2>FAQ</h2>
        <div className="landing-faq">
          <article className="landing-subcard">
            <h3>What is Trumpus?</h3>
            <p>Trumpus is a web app for AI character chats, persona-based conversations, and interactive assistant dialogue.</p>
          </article>
          <article className="landing-subcard">
            <h3>What can I do on Trumpus?</h3>
            <p>You can create AI chats, explore different personas, save your conversation history, and continue your chats from any device.</p>
          </article>
          <article className="landing-subcard">
            <h3>Does Trumpus support persona-based AI chats?</h3>
            <p>Yes. Trumpus is built around persona-driven conversations and character-style AI dialogue.</p>
          </article>
          <article className="landing-subcard">
            <h3>Can I save my chat history?</h3>
            <p>Yes. Your conversations are stored in your account so you can return to them anytime.</p>
          </article>
        </div>
      </section>

      <section className="landing-section landing-cta">
        <h2>Start your first AI persona chat</h2>
        <p>Create an account, open a new conversation, and explore interactive AI dialogue with unique personas.</p>
        <Link
          to="/register"
          className="landing-btn primary"
          onClick={() => trackEvent('sign_up_click', { source: 'landing_final_cta' })}
        >
          Create Account
        </Link>
      </section>
    </section>
  )
}
