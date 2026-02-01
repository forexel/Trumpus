import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createChat, getClientId, sendMessage } from '../lib/api'
import trumpAvatar from '../assets/trump.png'
import obamaAvatar from '../assets/obama.png'

const PERSONAS = ['Donald Trump', 'Barack Obama']
const PERSONA_AVATARS: Record<string, string> = {
  'Donald Trump': trumpAvatar,
  'Barack Obama': obamaAvatar,
}

export default function NewChatPage() {
  const [persona, setPersona] = useState(PERSONAS[0])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const clientId = useMemo(() => getClientId(), [])

  async function onSend() {
    if (!clientId || !message.trim()) return
    setLoading(true)
    try {
      const chat = await createChat(clientId, persona)
      await sendMessage(chat.id, message)
      navigate(`/chats/${chat.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mobile-page">
      <header className="mobile-header">
        <button className="back-btn" onClick={() => navigate(-1)} aria-label="Back">
          ←
        </button>
        <div className="header-title">New Chat</div>
        <div className="header-spacer" />
      </header>

      <main className="mobile-content">
        <div className="center-block">
          <div className="hint">Start new chat with...</div>
          <div className="persona-select">
            <button className="persona-current" onClick={() => setOpen((v) => !v)}>
              <span className="avatar small">
                <img src={PERSONA_AVATARS[persona]} alt={persona} />
              </span>
              {persona}
              <span className="chevron">▾</span>
            </button>
            {open ? (
              <div className="persona-menu">
                {PERSONAS.map((p) => (
                  <button
                    key={p}
                    className={`persona-item ${p === persona ? 'active' : ''}`}
                    onClick={() => {
                      setPersona(p)
                      setOpen(false)
                    }}
                  >
                    <span className="avatar small">
                      <img src={PERSONA_AVATARS[p]} alt={p} />
                    </span>
                    {p}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="composer floating">
          <input
            placeholder="Ask me something"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="send-btn" onClick={onSend} disabled={loading}>
            ↑
          </button>
        </div>
      </main>
    </div>
  )
}
