import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchChats, getWsBase, AdminChat } from '../lib/api'
import ChatDetailPage from './ChatDetailPage'

export default function ChatsPage() {
  const [chats, setChats] = useState<AdminChat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { id } = useParams()
  const activeChatId = id ?? ''

  const sortChatsByFresh = (items: AdminChat[]) =>
    [...items].sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())

  useEffect(() => {
    let mounted = true
    fetchChats()
      .then((data) => {
        if (mounted) setChats(sortChatsByFresh(data.items))
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
        if (payload?.type === 'chat_deleted' && payload?.chat_id) {
          const deletedId = String(payload.chat_id)
          setChats((prev) => prev.filter((chat) => chat.id !== deletedId))
          return
        }
        const chatId = payload?.chat_id as string | undefined
        const unread = payload?.unread_for_admin as number | undefined
        if (!chatId || typeof unread !== 'number') return
        setChats((prev) => sortChatsByFresh(prev.map((chat) => (
          chat.id === chatId ? { ...chat, unread_for_admin: unread } : chat
        ))))
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
            {chats.length === 0 ? (
              <div className="chat-tree-empty">No chats yet</div>
            ) : (
              chats.map((chat) => (
                <Link
                  key={chat.id}
                  className={`chat-tree-item ${activeChatId === chat.id ? 'active' : ''}`}
                  to={`/chats/${chat.id}`}
                >
                  <span className="chat-tree-main">
                    <span className="chat-tree-title">{chat.title}</span>
                    <span className="chat-tree-client-name">{chat.client_name}</span>
                  </span>
                  {chat.unread_for_admin > 0 ? (
                    <span className="unread-dot" title="New message" />
                  ) : null}
                </Link>
              ))
            )}
          </div>
        )}
      </aside>
      <section className="chat-pane">
        <ChatDetailPage
          chatId={activeChatId}
          onDeleted={(deletedId) => {
            setChats((prev) => prev.filter((chat) => chat.id !== deletedId))
          }}
        />
      </section>
    </div>
  )
}
