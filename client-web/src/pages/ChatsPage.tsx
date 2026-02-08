import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchChats, fetchMessages, getClientId, ChatSummary, deleteChat, createChat, sendMessage, logout } from '../lib/api'
import { useTheme } from '../lib/useTheme'
import { PERSONAS, Persona } from './NewChatPage'
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

const PERSONA_AVATARS: Record<string, string> = {
  'Donald Trump': trumpAvatar,
  'Elon Musk': muskAvatar,
  'Kanye West': kanyeAvatar,
  'Richard Nixon': nixonAvatar,
  'Andrew Jackson': jacksonAvatar,
  'Marjorie Taylor Greene': greeneAvatar,
  'Tucker Carlson': tuckerAvatar,
  'Lyndon B. Johnson': lbjAvatar,
  'Mark Zuckerberg': zuckAvatar,
  'Jeffrey Epstein': epsteinAvatar,
}

const PERSONA_COLORS: Record<string, string> = {
  'Donald Trump': '#c41e3a',
  'Elon Musk': '#1DA1F2',
  'Kanye West': '#111827',
  'Richard Nixon': '#0f172a',
  'Andrew Jackson': '#7c2d12',
  'Marjorie Taylor Greene': '#1f7a3a',
  'Tucker Carlson': '#0b3d91',
  'Lyndon B. Johnson': '#7c3aed',
  'Mark Zuckerberg': '#2563eb',
  'Jeffrey Epstein': '#6b7280',
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase()
}

function formatChatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  } else if (days === 1) {
    return 'Yesterday'
  } else if (days < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

export default function ChatsPage() {
  const [loading, setLoading] = useState(true)
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [lastMessages, setLastMessages] = useState<Record<string, { content: string; time: string; sender: string }>>({})
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [optionsMaxHeight, setOptionsMaxHeight] = useState(392)
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({})
  const [swipingId, setSwipingId] = useState<string | null>(null)
  const [isSwiping, setIsSwiping] = useState(false)
  const swipeStartX = useRef(0)
  const selectRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const clientId = getClientId()

  const loadChats = async () => {
    const clientId = getClientId()
    if (!clientId) {
      navigate('/login')
      return
    }

    try {
      const data = await fetchChats(clientId)
      setChats(data.items)

      // Load last messages for each chat from API
      const entries = await Promise.all(
        data.items.map(async (chat) => {
          try {
            const res = await fetchMessages(chat.id)
            const last = res.items[res.items.length - 1]
            if (!last) return null
            return {
              chatId: chat.id,
              content: last.content,
              time: last.created_at,
              sender: last.sender,
            }
          } catch {
            return null
          }
        })
      )
      const messages: Record<string, { content: string; time: string; sender: string }> = {}
      entries.forEach((entry) => {
        if (entry) {
          messages[entry.chatId] = {
            content: entry.content,
            time: entry.time,
            sender: entry.sender,
          }
        }
      })
      setLastMessages(messages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadChats()
  }, [navigate])

  useEffect(() => {
    if (!isOpen) return
    const update = () => {
      const el = selectRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const available = viewportHeight - rect.bottom - 16
      const rowHeight = 56
      const rowsFit = Math.max(1, Math.floor(available / rowHeight))
      const maxRows = Math.min(7, Math.max(3, rowsFit))
      const next = Math.min(available, rowHeight * maxRows)
      setOptionsMaxHeight(Math.max(rowHeight, Math.floor(next)))
    }
    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [isOpen])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (confirm('Delete this chat?')) {
      setDeletingId(chatId)
      deleteChat(chatId)
      setChats(prev => prev.filter(c => c.id !== chatId))
      setDeletingId(null)
    }
  }

  const handleSwipeStart = (e: React.PointerEvent, chatId: string) => {
    swipeStartX.current = e.clientX
    setSwipingId(chatId)
    setIsSwiping(false)
    try {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
  }

  const handleSwipeMove = (e: React.PointerEvent, chatId: string) => {
    if (swipingId !== chatId) return
    const delta = e.clientX - swipeStartX.current
    if (delta > 0) return
    const clamped = Math.max(delta, -96)
    if (Math.abs(clamped) > 6) setIsSwiping(true)
    setSwipeOffsets(prev => ({ ...prev, [chatId]: clamped }))
  }

  const handleSwipeEnd = (e: React.PointerEvent, chatId: string) => {
    if (swipingId !== chatId) return
    const offset = swipeOffsets[chatId] ?? 0
    setSwipingId(null)
    if (offset < -60) {
      if (confirm('Delete this chat?')) {
        setDeletingId(chatId)
        deleteChat(chatId)
        setChats(prev => prev.filter(c => c.id !== chatId))
        setDeletingId(null)
      }
    }
    setSwipeOffsets(prev => ({ ...prev, [chatId]: 0 }))
    setIsSwiping(false)
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {}
  }

  const truncateMessage = (msg: string, maxLen: number = 45): string => {
    if (msg.length <= maxLen) return msg
    return msg.slice(0, maxLen).trim() + '...'
  }

  const hasChats = chats.length > 0

  async function handleStartFromEmpty() {
    if (!clientId || !message.trim()) return
    setSending(true)
    try {
      const chat = await createChat(clientId, selectedPersona.name)
      await sendMessage(chat.id, message, selectedPersona.name)
      navigate(`/chats/${chat.id}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mobile-page">
      <header className="mobile-header">
        <div className="header-logo">
          <span className="logo-text">Trumpus</span>
        </div>
        <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="theme-icon theme-icon-moon" aria-hidden="true" />
            <span className="theme-icon theme-icon-sun" aria-hidden="true" />
          </button>
          <button className="logout-btn" onClick={handleLogout} title="Log out">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      <main className="mobile-content">
        {loading ? (
          <div className="empty-state">
            <img src={eagleIcon} alt="Loading" className="eagle-loader" />
            <p className="empty-subtitle">Loading chats...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <div className="empty-title">Something went wrong</div>
            <p className="empty-subtitle">{error}</p>
            <button className="retry-btn" onClick={loadChats}>Try again</button>
          </div>
        ) : !hasChats ? (
          <div className="empty-state persona-empty">
            <div className="persona-select-block">
              <div className="persona-select-title">Start new chat with...</div>
              <div className={`persona-select-list ${isOpen ? 'open' : ''}`} ref={selectRef}>
                <button className="persona-option selected" type="button" onClick={() => setIsOpen(prev => !prev)}>
                  <span className="persona-option-avatar">
                    {selectedPersona.avatar ? <img src={selectedPersona.avatar} alt={selectedPersona.name} /> : null}
                  </span>
                  <span className="persona-option-name">{selectedPersona.name}</span>
                  <span className="persona-option-caret" aria-hidden="true" />
                </button>
                {isOpen ? (
                  <div className="persona-options" style={{ maxHeight: optionsMaxHeight }}>
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
          </div>
        ) : (
          <div className="chats-list-container">
            {chats.map((chat) => {
              const lastMsg = lastMessages[chat.id]
              const avatarUrl = PERSONA_AVATARS[chat.persona]
              const color = PERSONA_COLORS[chat.persona] || '#3b82f6'
              return (
                <Link 
                  key={chat.id} 
                  className={`chat-item ${deletingId === chat.id ? 'deleting' : ''}`} 
                  to={`/chats/${chat.id}`}
                  onClick={(e) => {
                    if (isSwiping) {
                      e.preventDefault()
                      e.stopPropagation()
                    }
                  }}
                  onPointerDown={(e) => handleSwipeStart(e, chat.id)}
                  onPointerMove={(e) => handleSwipeMove(e, chat.id)}
                  onPointerUp={(e) => handleSwipeEnd(e, chat.id)}
                  onPointerCancel={(e) => handleSwipeEnd(e, chat.id)}
                >
                  <div className="chat-swipe-bg">
                    <span className="chat-swipe-text">Delete</span>
                  </div>
                  <div
                    className="chat-item-inner"
                    style={{ transform: `translateX(${swipeOffsets[chat.id] ?? 0}px)` }}
                  >
                    <div className="chat-avatar" style={{ borderColor: color }}>
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={chat.persona} />
                      ) : (
                        <div 
                          className="chat-avatar-placeholder" 
                          style={{ backgroundColor: color }}
                        >
                          {getInitials(chat.persona || 'AI')}
                        </div>
                      )}
                    </div>
                    
                    <div className="chat-content">
                      <div className="chat-top-row">
                        <span className="chat-name">
                          {chat.persona || 'New Chat'}
                        </span>
                        <span className="chat-time">
                          {lastMsg ? formatChatTime(lastMsg.time) : ''}
                        </span>
                      </div>
                      <div className="chat-preview">
                        {lastMsg ? (
                          <>
                            {lastMsg.sender === 'client' && <span className="you-prefix">You: </span>}
                            {truncateMessage(lastMsg.content)}
                          </>
                        ) : (
                          <span className="no-messages">Tap to start chatting</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      {!hasChats ? (
        <div className="composer-bottom composer-fixed">
          <input
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleStartFromEmpty()}
            disabled={sending}
          />
          <button
            className="send-btn eagle-btn"
            onClick={handleStartFromEmpty}
            disabled={sending}
            title={`Start chat with ${selectedPersona.name}`}
          >
            <img src={eagleIcon} alt="Send" className={`eagle-send-icon ${sending ? 'flying' : ''}`} />
          </button>
        </div>
      ) : null}

      {hasChats ? (
        <button className="new-chat-btn" onClick={() => navigate('/chats/new')} title="New Chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <line x1="12" y1="8" x2="12" y2="14"/>
            <line x1="9" y1="11" x2="15" y2="11"/>
          </svg>
        </button>
      ) : null}
    </div>
  )
}
