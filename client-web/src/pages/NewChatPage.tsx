import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createChat, getAccessToken, getClientId, sendMessage } from '../lib/api'
import { useTheme } from '../lib/useTheme'
import trumpAvatar from '../assets/DonaldTrump.png'
import muskAvatar from '../assets/ElonMask.png'
import kanyeAvatar from '../assets/KaneyWest.png'
import nixonAvatar from '../assets/RichardNixon.png'
import jacksonAvatar from '../assets/AndrewJackson.png'
import greeneAvatar from '../assets/MarjorieTaylorGreene.png'
import tuckerAvatar from '../assets/TuckerCarlson.png'
import lbjAvatar from '../assets/LyndonBJohnson.png'
import zuckAvatar from '../assets/MarkZuckerberg.png'
import epsteinAvatar from '../assets/JeffreyEpstein.png'
import eagleIcon from '../assets/eagle.png'
import { trackEvent } from '../lib/analytics'

// Available personas for selection
export const PERSONAS = [
  {
    id: 'donald-trump',
    name: 'Donald Trump',
    avatar: trumpAvatar,
    color: '#c41e3a',
    tagline: 'Make conversations GREAT again!',
    description: 'Former President, Real Estate Mogul, Master Negotiator',
  },
  {
    id: 'elon-musk',
    name: 'Elon Musk',
    avatar: muskAvatar,
    color: '#1DA1F2',
    tagline: 'To infinity and beyond... to Mars!',
    description: 'CEO of Tesla & SpaceX, Chief Meme Officer',
  },
  {
    id: 'kanye-west',
    name: 'Kanye West',
    avatar: kanyeAvatar,
    color: '#111827',
    tagline: 'Visionary, artist, icon.',
    description: 'Producer, designer, cultural disruptor',
  },
  {
    id: 'richard-nixon',
    name: 'Richard Nixon',
    avatar: nixonAvatar,
    color: '#0f172a',
    tagline: 'Law & order, strategy & focus.',
    description: '37th President of the United States',
  },
  {
    id: 'andrew-jackson',
    name: 'Andrew Jackson',
    avatar: jacksonAvatar,
    color: '#7c2d12',
    tagline: 'Hard decisions, bold moves.',
    description: '7th President of the United States',
  },
  {
    id: 'marjorie-taylor-greene',
    name: 'Marjorie Taylor Greene',
    avatar: greeneAvatar,
    color: '#1f7a3a',
    tagline: 'No filter. Straight talk.',
    description: 'U.S. Congresswoman',
  },
  {
    id: 'tucker-carlson',
    name: 'Tucker Carlson',
    avatar: tuckerAvatar,
    color: '#0b3d91',
    tagline: 'Questions that cut through noise.',
    description: 'Media personality',
  },
  {
    id: 'lyndon-b-johnson',
    name: 'Lyndon B. Johnson',
    avatar: lbjAvatar,
    color: '#7c3aed',
    tagline: 'Power, policy, and persuasion.',
    description: '36th President of the United States',
  },
  {
    id: 'mark-zuckerberg',
    name: 'Mark Zuckerberg',
    avatar: zuckAvatar,
    color: '#2563eb',
    tagline: 'Product, scale, execution.',
    description: 'Founder of Meta',
  },
  {
    id: 'jeffrey-epstein',
    name: 'Jeffrey Epstein',
    avatar: epsteinAvatar,
    color: '#6b7280',
    tagline: 'Brief responses, minimal detail.',
    description: 'Financier',
  },
] as const

export type Persona = typeof PERSONAS[number]

// Generate initials for avatar placeholder
function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase()
}

export default function NewChatPage() {
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(392)
  const optionsRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()

  const clientId = useMemo(() => getClientId(), [])

  useEffect(() => {
    if (!getAccessToken() && !clientId) {
      navigate('/login', { replace: true })
    }
  }, [clientId, navigate])

  useLayoutEffect(() => {
    if (!isOpen || !optionsRef.current) return
    const rect = optionsRef.current.getBoundingClientRect()
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const available = viewportHeight - rect.top - 16
    const rowHeight = 56
    const rowsFit = Math.max(1, Math.floor(available / rowHeight))
    const maxRows = Math.min(7, Math.max(3, rowsFit))
    const next = Math.min(available, rowHeight * maxRows)
    setOptionsMaxHeight(Math.max(rowHeight, Math.floor(next)))
  }, [isOpen])

  async function startChat(persona: Persona) {
    if (!clientId) return
    
    // If no message, just create chat and navigate
    if (!message.trim()) {
      setLoading(true)
      try {
        const chat = await createChat(clientId, persona.name)
        trackEvent('new_chat_started', { persona: persona.name, source: 'new_chat_page_empty' })
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
      trackEvent('new_chat_started', { persona: persona.name, source: 'new_chat_page_with_message' })
      await sendMessage(chat.id, message, persona.name)
      navigate(`/chats/${chat.id}`)
    } finally {
      setLoading(false)
    }
  }

  async function onSend() {
    if (!message.trim()) return
    await startChat(selectedPersona)
  }

  function renderPersonaOption(p: Persona, withCaret: boolean) {
    const isSelected = selectedPersona?.id === p.id
    return (
      <button
        key={p.id}
        className={`persona-option ${isSelected ? 'selected' : ''}`}
        onClick={() => setSelectedPersona(p)}
        type="button"
      >
        <span className="persona-option-avatar">
          {p.avatar ? (
            <img src={p.avatar} alt={p.name} />
          ) : (
            <span className="persona-option-placeholder">
              {getInitials(p.name)}
            </span>
          )}
        </span>
        <span className="persona-option-name">{p.name}</span>
        {withCaret ? <span className="persona-option-caret" aria-hidden="true">▾</span> : null}
      </button>
    )
  }

  return (
    <div className="mobile-page new-chat-page">
      <header className="mobile-header">
        <button className="back-btn" onClick={() => navigate('/chats')} aria-label="Back" />
        <span className="header-flag">🇺🇸</span>
        <div className="header-center">
          <div className="header-title">New Chat</div>
        </div>
        <span className="header-flag">🇺🇸</span>
        <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          <span className="theme-icon theme-icon-moon" aria-hidden="true" />
          <span className="theme-icon theme-icon-sun" aria-hidden="true" />
        </button>
      </header>

      <main className="mobile-content new-chat-content">
        <div className="page-intro">
          <h1>Start a new AI chat</h1>
          <p>Choose a persona, open a new conversation, and begin an interactive AI dialogue in seconds.</p>
          <small>
            Create a character-style conversation for entertainment, brainstorming, creative thinking, or everyday
            interaction.
          </small>
        </div>
        <div className="persona-select-block">
          <div className="persona-select-title">Start new chat with...</div>
          <div className={`persona-select-list ${isOpen ? 'open' : ''}`}>
            <button
              className="persona-option selected"
              type="button"
              onClick={() => setIsOpen(prev => !prev)}
            >
              <span className="persona-option-avatar">
                {selectedPersona.avatar ? <img src={selectedPersona.avatar} alt={selectedPersona.name} /> : null}
              </span>
              <span className="persona-option-name">{selectedPersona.name}</span>
              <span className="persona-option-caret" aria-hidden="true" />
            </button>
            {isOpen ? (
              <div className="persona-options" ref={optionsRef} style={{ maxHeight: optionsMaxHeight }}>
                {PERSONAS.filter(p => p.id !== selectedPersona.id).map(p => (
                  <button
                    key={p.id}
                    className="persona-option"
                    type="button"
                    onClick={() => {
                      setSelectedPersona(p)
                      setIsOpen(false)
                    }}
                  >
                    <span className="persona-option-avatar">
                      {p.avatar ? <img src={p.avatar} alt={p.name} /> : null}
                    </span>
                    <span className="persona-option-name">{p.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <div className="composer-bottom composer-fixed composer-newchat">
        <div className="composer-wrapper">
          <input
            placeholder="Ask me something"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
            disabled={loading}
          />
          <button 
            className="send-btn eagle-btn" 
            onClick={onSend} 
            disabled={loading}
            title={selectedPersona ? `Start chat with ${selectedPersona.name}` : 'Select a persona first'}
          >
            <img src={eagleIcon} alt="Send" className={`eagle-send-icon ${loading ? 'flying' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  )
}
