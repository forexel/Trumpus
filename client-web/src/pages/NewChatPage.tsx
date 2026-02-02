import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createChat, getClientId, sendMessage } from '../lib/api'
import trumpAvatar from '../assets/trump.png'
import obamaAvatar from '../assets/obama.png'

// Available personas for selection
export const PERSONAS = [
  { 
    id: 'trump', 
    name: 'Donald Trump', 
    avatar: trumpAvatar, 
    color: '#c41e3a',
    emoji: '🇺🇸',
    tagline: 'Make conversations GREAT again!',
    description: 'Former President, Real Estate Mogul, Master Negotiator'
  },
  { 
    id: 'obama', 
    name: 'Barack Obama', 
    avatar: obamaAvatar, 
    color: '#1e3a6e',
    emoji: '✨',
    tagline: 'Yes we can... chat!',
    description: '44th President, Nobel Peace Prize Winner, Hope & Change'
  },
  { 
    id: 'musk', 
    name: 'Elon Musk', 
    avatar: null, 
    color: '#1DA1F2',
    emoji: '🚀',
    tagline: 'To infinity and beyond... to Mars!',
    description: 'CEO of Tesla & SpaceX, Chief Meme Officer'
  },
  { 
    id: 'biden', 
    name: 'Joe Biden', 
    avatar: null, 
    color: '#0033A0',
    emoji: '🍦',
    tagline: 'Here\'s the deal, folks...',
    description: '46th President, Ice Cream Enthusiast, Train Lover'
  },
  { 
    id: 'putin', 
    name: 'Vladimir Putin', 
    avatar: null, 
    color: '#D52B1E',
    emoji: '🐻',
    tagline: 'In Russia, chat starts YOU!',
    description: 'President of Russia, Judo Master, Bear Wrestler'
  },
  { 
    id: 'kim', 
    name: 'Kim Jong Un', 
    avatar: null, 
    color: '#024FA2',
    emoji: '🎆',
    tagline: 'Supreme chat experience!',
    description: 'Supreme Leader, Rocket Scientist, Basketball Fan'
  },
] as const

export type Persona = typeof PERSONAS[number]

// Generate initials for avatar placeholder
function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase()
}

export default function NewChatPage() {
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const clientId = useMemo(() => getClientId(), [])

  async function startChat(persona: Persona) {
    if (!clientId) return
    
    // If no message, just create chat and navigate
    if (!message.trim()) {
      setLoading(true)
      try {
        const chat = await createChat(clientId, persona.name)
        navigate(`/chats/${chat.id}`)
      } finally {
        setLoading(false)
      }
      return
    }

    // If there's a message, create chat and send it
    setLoading(true)
    try {
      const chat = await createChat(clientId, persona.name)
      await sendMessage(chat.id, message)
      navigate(`/chats/${chat.id}`)
    } finally {
      setLoading(false)
    }
  }

  async function onSend() {
    if (!selectedPersona || !message.trim()) return
    await startChat(selectedPersona)
  }

  function renderPersonaCard(p: Persona) {
    const isSelected = selectedPersona?.id === p.id
    
    return (
      <button 
        key={p.id}
        className={`persona-card ${isSelected ? 'selected' : ''}`}
        onClick={() => setSelectedPersona(p)}
        onDoubleClick={() => startChat(p)}
      >
        <div className="persona-card-avatar" style={{ borderColor: p.color }}>
          {p.avatar ? (
            <img src={p.avatar} alt={p.name} />
          ) : (
            <div 
              className="avatar-placeholder-large" 
              style={{ backgroundColor: p.color }}
            >
              {getInitials(p.name)}
            </div>
          )}
          <span className="persona-emoji">{p.emoji}</span>
        </div>
        <div className="persona-card-info">
          <h3 className="persona-card-name">{p.name}</h3>
          <p className="persona-card-tagline">{p.tagline}</p>
          <p className="persona-card-desc">{p.description}</p>
        </div>
        {isSelected && (
          <div className="persona-check">✓</div>
        )}
      </button>
    )
  }

  return (
    <div className="mobile-page new-chat-page">
      <header className="mobile-header">
        <button className="back-btn" onClick={() => navigate(-1)} aria-label="Back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="header-center">
          <div className="header-title">New Chat</div>
          <div className="header-subtitle">Select a persona to start</div>
        </div>
        <div className="header-spacer" />
      </header>

      <main className="mobile-content new-chat-content">
        <div className="section-header">
          <span className="section-icon">🌟</span>
          <span>Choose Your Companion</span>
        </div>
        
        <div className="persona-grid">
          {PERSONAS.map(renderPersonaCard)}
        </div>

        {selectedPersona && (
          <div className="selected-banner">
            <span>Selected: <strong>{selectedPersona.name}</strong></span>
            <span className="selected-emoji">{selectedPersona.emoji}</span>
          </div>
        )}
      </main>

      <div className="composer-bottom">
        <div className="composer-wrapper">
          <input
            placeholder={selectedPersona 
              ? `Message ${selectedPersona.name}...` 
              : "Select a persona first..."
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
            disabled={!selectedPersona || loading}
          />
          <button 
            className="send-btn" 
            onClick={onSend} 
            disabled={!selectedPersona || loading}
            title={selectedPersona ? `Start chat with ${selectedPersona.name}` : 'Select a persona first'}
          >
            {loading ? (
              <div className="send-spinner" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            )}
          </button>
        </div>
        <div className="composer-hint">
          {selectedPersona 
            ? "Type a message or tap a persona twice to start immediately"
            : "Tap a persona card to select, double-tap to start chat"
          }
        </div>
      </div>
    </div>
  )
}
