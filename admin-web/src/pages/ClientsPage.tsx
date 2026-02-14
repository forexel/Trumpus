import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchClients, fetchChats, AdminClient, AdminChat } from '../lib/api'

type ClientWithSortedChats = AdminClient & { chats: (AdminClient['chats'][number] & { last_message_at: string })[] }

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientWithSortedChats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const sortByFreshChat = (items: ClientWithSortedChats[]) =>
    [...items].sort((a, b) => {
      const aTs = a.chats[0]?.last_message_at ? new Date(a.chats[0].last_message_at).getTime() : 0
      const bTs = b.chats[0]?.last_message_at ? new Date(b.chats[0].last_message_at).getTime() : 0
      return bTs - aTs
    })

  useEffect(() => {
    let mounted = true
    Promise.all([fetchClients(), fetchChats()])
      .then(([clientsData, chatsData]) => {
        const chatsByClient: Record<string, AdminChat[]> = {}
        for (const chat of chatsData.items) {
          if (!chatsByClient[chat.client_id]) chatsByClient[chat.client_id] = []
          chatsByClient[chat.client_id].push(chat)
        }
        const normalized = clientsData.items.map((client) => {
          const fullChats = (chatsByClient[client.id] || [])
            .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
            .map((chat) => ({
              id: chat.id,
              title: chat.title,
              persona: chat.persona,
              unread_for_admin: chat.unread_for_admin,
              last_message_at: chat.last_message_at,
            }))
          return { ...client, chats: fullChats }
        })
        if (mounted) setClients(sortByFreshChat(normalized))
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load clients')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return <div className="card">Loading clients...</div>
  }

  if (error) {
    return <div className="card error">{error}</div>
  }

  return (
    <div className="card wide">
      <h1>Clients</h1>
      <div className="clients-grid">
        {clients.map((client) => (
          <div key={client.id} className="client-card">
            <div className="client-header">
              <h2>{client.name}</h2>
            </div>
            <div className="list">
              {client.chats.length === 0 ? (
                <div className="list-item muted">No chats yet</div>
              ) : (
                client.chats.map((chat) => (
                  <Link key={chat.id} className="list-item chat-item chat-row" to={`/chats/${chat.id}`}>
                    <span className="chip-btn">{chat.title}</span>
                    {chat.persona ? (
                      <span className="chip-badge" title="Persona">{chat.persona}</span>
                    ) : null}
                    {chat.unread_for_admin > 0 ? (
                      <span className="unread-dot" title="New message" />
                    ) : null}
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
