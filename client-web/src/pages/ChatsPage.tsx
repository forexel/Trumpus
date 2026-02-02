import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchChats, getClientId, ChatSummary, getLastMessage, deleteChat } from '../lib/api'
import { useTheme } from '../lib/useTheme'
import trumpAvatar from '../assets/trump.png'
import obamaAvatar from '../assets/obama.png'
import eagleIcon from '../assets/eagle.png'

const PERSONA_AVATARS: Record<string, string> = {
  'Donald Trump': trumpAvatar,
  'Barack Obama': obamaAvatar,
}

const PERSONA_COLORS: Record<string, string> = {
  'Donald Trump': '#e63946',
  'Barack Obama': '#457b9d',
  'Elon Musk': '#1d3557',
  'Joe Biden': '#2a9d8f',
  'Vladimir Putin': '#6c757d',
  'Kim Jong Un': '#d62828',
}

const PERSONA_EMOJIS: Record<string, string> = {
  'Donald Trump': '🇺🇸',
  'Barack Obama': '✨',
  'Elon Musk': '🚀',
  'Joe Biden': '🍦',
  'Vladimir Putin': '🐻',
  'Kim Jong Un': '🎆',
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
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()

  const loadChats = async () => {
    const clientId = getClientId()
    if (!clientId) {
      navigate('/login')
      return
    }

    try {
      const data = await fetchChats(clientId)
      setChats(data.items)
      
      // Load last messages for each chat
      const messages: Record<string, { content: string; time: string; sender: string }> = {}
      data.items.forEach(chat => {
        const lastMsg = getLastMessage(chat.id)
        if (lastMsg) {
          messages[chat.id] = {
            content: lastMsg.content,
            time: lastMsg.created_at,
            sender: lastMsg.sender
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

  const handleLogout = () => {
    localStorage.removeItem('client_token')
    localStorage.removeItem('client_email')
    localStorage.removeItem('client_id')
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

  const truncateMessage = (msg: string, maxLen: number = 45): string => {
    if (msg.length <= maxLen) return msg
    return msg.slice(0, maxLen).trim() + '...'
  }

  const hasChats = chats.length > 0

  return (
    <div className="mobile-page">
      <header className="mobile-header">
        <div className="header-logo">
          <span className="logo-text">Trumpus</span>
        </div>
        <div className="header-actions">
          <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
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
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <div className="empty-title">No conversations yet</div>
            <p className="empty-subtitle">
              Start chatting with AI personas like Trump, Obama, Musk, and more!
            </p>
          </div>
        ) : (
          <div className="chats-list-container">
            {chats.map((chat) => {
              const lastMsg = lastMessages[chat.id]
              const avatarUrl = PERSONA_AVATARS[chat.persona]
              const color = PERSONA_COLORS[chat.persona] || '#3b82f6'
              const emoji = PERSONA_EMOJIS[chat.persona] || '🤖'
              
              return (
                <Link 
                  key={chat.id} 
                  className={`chat-item ${deletingId === chat.id ? 'deleting' : ''}`} 
                  to={`/chats/${chat.id}`}
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
                        {chat.persona || 'New Chat'} {emoji}
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
                  
                  <button 
                    className="chat-delete-btn"
                    onClick={(e) => handleDeleteChat(e, chat.id)}
                    title="Delete chat"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      <button className="new-chat-btn" onClick={() => navigate('/chats/new')} title="New Chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <line x1="12" y1="8" x2="12" y2="14"/>
          <line x1="9" y1="11" x2="15" y2="11"/>
        </svg>
      </button>
    </div>
  )
}
