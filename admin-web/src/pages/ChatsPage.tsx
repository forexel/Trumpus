import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchClients, getWsBase, AdminClient } from '../lib/api'
import ChatDetailPage from './ChatDetailPage'

export default function ChatsPage() {
  const [clients, setClients] = useState<AdminClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { id } = useParams()
  const activeChatId = id ?? ''

  useEffect(() => {
    let mounted = true
    fetchClients()
      .then((data) => {
        if (mounted) setClients(data.items)
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load chats')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const ws = new WebSocket(`${getWsBase()}/ws?scope=all`)
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        const chatId = payload?.chat_id as string | undefined
        const unread = payload?.unread_for_admin as number | undefined
        if (!chatId || typeof unread !== 'number') return
        setClients((prev) =>
          prev.map((client) => {
            const chats = client.chats.map((chat) =>
              chat.id === chatId ? { ...chat, unread_for_admin: unread } : chat
            )
            return { ...client, chats }
          })
        )
      } catch {
        // ignore malformed events
      }
    }
    return () => {
      ws.close()
    }
  }, [])

  return (
    <div className="chat-layout">
      <aside className="chat-tree">
        <div className="chat-tree-header">Chats</div>
        {loading ? (
          <div className="chat-tree-loading">Loading chats...</div>
        ) : error ? (
          <div className="chat-tree-loading error">{error}</div>
        ) : (
          <div className="chat-tree-list">
            {clients.map((client) => (
              <div key={client.id} className="chat-tree-group">
                <div className="chat-tree-client">{client.name}</div>
                {client.chats.length === 0 ? (
                  <div className="chat-tree-empty">No chats yet</div>
                ) : (
                  client.chats.map((chat) => (
                    <Link
                      key={chat.id}
                      className={`chat-tree-item ${activeChatId === chat.id ? 'active' : ''}`}
                      to={`/chats/${chat.id}`}
                    >
                      <span className="chat-tree-title">{chat.title}</span>
                      {chat.unread_for_admin > 0 ? (
                        <span className="unread-dot" title="New message" />
                      ) : null}
                    </Link>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </aside>
      <section className="chat-pane">
        <ChatDetailPage chatId={activeChatId} />
      </section>
    </div>
  )
}
