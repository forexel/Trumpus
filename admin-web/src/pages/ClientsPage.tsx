import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchClients, AdminClient } from '../lib/api'

export default function ClientsPage() {
  const [clients, setClients] = useState<AdminClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    fetchClients()
      .then((data) => {
        if (mounted) setClients(data.items)
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
