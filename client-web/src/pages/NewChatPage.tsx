import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createChat, getClientId, sendMessage } from '../lib/api'
import { useTheme } from '../lib/useTheme'
import trumpAvatar from '../assets/trump.png'
import obamaAvatar from '../assets/obama.png'
import eagleIcon from '../assets/eagle.png'

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
  const { theme, toggleTheme } = useTheme()

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
        <span className="header-flag">🇺🇸</span>
        <div className="header-center">
          <div className="header-title">New Chat</div>
          <div className="header-subtitle">Select a persona to start</div>
        </div>
        <span className="header-flag">🇺🇸</span>
        <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
      </header>

      <main className="mobile-content new-chat-content">
        <div className="section-header">
          <span className="section-icon">🇺🇸</span>
          <span>Choose Your Companion</span>
          <span className="section-icon">🇺🇸</span>
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
            className="send-btn eagle-btn" 
            onClick={onSend} 
            disabled={!selectedPersona || loading}
            title={selectedPersona ? `Start chat with ${selectedPersona.name}` : 'Select a persona first'}
          >
            <img src={eagleIcon} alt="Send" className={`eagle-send-icon ${loading ? 'flying' : ''}`} />
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
