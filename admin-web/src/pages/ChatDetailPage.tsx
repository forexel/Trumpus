import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchChatMessages, markChatRead, sendChatMessage, getWsBase, Message, AdminChat } from '../lib/api'

type ChatDetailProps = {
  chatId?: string
}

export default function ChatDetailPage({ chatId: chatIdProp }: ChatDetailProps) {
  const { id } = useParams()
  const chatId = chatIdProp ?? id ?? ''
  const [chat, setChat] = useState<AdminChat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const markdownComponents = useMemo(
    () => ({
      p: ({ children }: { children: React.ReactNode }) => <p className="msg-text">{children}</p>,
      ul: ({ children }: { children: React.ReactNode }) => <ul className="msg-list">{children}</ul>,
      ol: ({ children }: { children: React.ReactNode }) => <ol className="msg-list">{children}</ol>,
      li: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
      strong: ({ children }: { children: React.ReactNode }) => <strong className="msg-strong">{children}</strong>,
    }),
    []
  )

  useEffect(() => {
    let mounted = true
    if (!chatId) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchChatMessages(chatId)
      .then((data) => {
        if (!mounted) return
        setChat(data.chat)
        setMessages(data.messages)
      })
      .then(() => markChatRead(chatId))
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load chat')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [chatId])

  useEffect(() => {
    if (!chatId) return
    const ws = new WebSocket(`${getWsBase()}/ws?chat_id=${encodeURIComponent(chatId)}`)
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload?.type !== 'message_created') return
        if (payload?.chat_id !== chatId) return
        const incoming = payload?.message as Message | undefined
        if (!incoming) return
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev
          return [...prev, incoming]
        })
        if (incoming.sender === 'client') {
          markChatRead(chatId)
        }
      } catch {
        // ignore malformed events
      }
    }
    return () => {
      ws.close()
    }
  }, [chatId])

  async function onSend() {
    if (!chatId || !content.trim()) return
    const text = content
    setContent('')
    try {
      const msg = await sendChatMessage(chatId, text)
      setMessages((prev) => [...prev, msg])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    }
  }

  if (loading) {
    return <div className="card">Loading chat...</div>
  }

  if (error) {
    return <div className="card error">{error}</div>
  }

  if (!chatId) {
    return (
      <div className="empty-state">
        <div className="empty-title">Select a chat</div>
        <div className="muted">Choose a chat on the left to open the conversation.</div>
      </div>
    )
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div>
          <h1>{chat?.title ?? 'Chat'}</h1>
          <div className="muted">{chat?.client_name}</div>
        </div>
      </div>
      <div className="chat">
        {messages.map((msg) => (
          <div key={msg.id} className={`msg ${msg.sender === 'admin' ? 'right' : 'left'}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {msg.content}
            </ReactMarkdown>
            <div className="msg-meta">{new Date(msg.created_at).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>
      <div className="composer">
        <textarea
          placeholder="Type a message (Markdown supported)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
        />
        <button onClick={onSend}>Send</button>
      </div>
    </div>
  )
}
