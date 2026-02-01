import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchChats, getClientId, ChatSummary } from '../lib/api'
import eagle from '../assets/eagle.png'
import trumpAvatar from '../assets/trump.png'
import obamaAvatar from '../assets/obama.png'

const PERSONA_AVATARS: Record<string, string> = {
  'Donald Trump': trumpAvatar,
  'Barack Obama': obamaAvatar,
}

export default function ChatsPage() {
  const [loading, setLoading] = useState(true)
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const clientId = getClientId()
    if (!clientId) {
      navigate('/login')
      return
    }

    fetchChats(clientId)
      .then((data) => setChats(data.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [navigate])

  const hasChats = chats.length > 0

  const handleLogout = () => {
    localStorage.removeItem('client_token')
    localStorage.removeItem('client_email')
    localStorage.removeItem('client_id')
    navigate('/login')
  }

  return (
    <div className="mobile-page">
      <header className="mobile-header">
        <div className="header-spacer" />
        <div className="header-title">CHATS</div>
        <button className="logout-btn" onClick={handleLogout}>
          Log out
        </button>
      </header>

      <main className="mobile-content">
        {loading ? (
          <div className="empty-state">
            <div className="eagle-wrap loading">
              <img src={eagle} alt="" />
            </div>
          </div>
        ) : error ? (
          <div className="empty-state error">{error}</div>
        ) : !hasChats ? (
          <div className="empty-state">
            <div className="eagle-wrap">
              <img src={eagle} alt="" />
            </div>
            <button className="primary-btn" onClick={() => navigate('/chats/new')}>
              New chat
            </button>
          </div>
        ) : (
          <div className="chat-list">
            {chats.map((chat) => (
              <Link key={chat.id} className="chat-row" to={`/chats/${chat.id}`}>
                <div className="avatar">
                  {PERSONA_AVATARS[chat.persona] ? (
                    <img src={PERSONA_AVATARS[chat.persona]} alt={chat.persona} />
                  ) : (
                    <span>{chat.persona?.[0] ?? 'AI'}</span>
                  )}
                </div>
                <div className="chat-title">{chat.title || 'New chat'}</div>
              </Link>
            ))}
            <button className="primary-btn" onClick={() => navigate('/chats/new')}>
              New chat
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
