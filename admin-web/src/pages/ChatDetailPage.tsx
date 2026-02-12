import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchChatMessages, markChatRead, sendChatMessage, resendClientMessage, getWsBase, Message, AdminChat } from '../lib/api'

type ChatDetailProps = {
  chatId?: string
}

export default function ChatDetailPage({ chatId: chatIdProp }: ChatDetailProps) {
  const { id } = useParams()
  const chatId = chatIdProp ?? id ?? ''
  const [chat, setChat] = useState<AdminChat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [content, setContent] = useState('')
  const [resendingId, setResendingId] = useState('')
  const [resendTargetId, setResendTargetId] = useState('')
  const [resendTempId, setResendTempId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
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
        if (payload?.chat_id !== chatId) return
        const incoming = payload?.message as Message | undefined
        if (!incoming) return
        if (payload?.type === 'message_created') {
          setMessages((prev) => {
            if (resendTempId && incoming.sender === 'admin') {
              return prev.map((m) => (m.id === resendTempId ? incoming : m))
            }
            if (prev.some((m) => m.id === incoming.id)) return prev
            return [...prev, incoming]
          })
          if (resendingId && incoming.sender === 'admin') {
            setResendingId('')
            setResendTargetId('')
            setResendTempId('')
          }
          if (incoming.sender === 'client') {
            markChatRead(chatId)
          }
          return
        }
        if (payload?.type === 'message_updated') {
          setMessages((prev) => prev.map((m) => (m.id === incoming.id ? incoming : m)))
          if (resendTargetId && incoming.id === resendTargetId) {
            setResendingId('')
            setResendTargetId('')
            setResendTempId('')
          }
        }
      } catch {
        // ignore malformed events
      }
    }
    return () => {
      ws.close()
    }
  }, [chatId, resendTempId, resendTargetId, resendingId])

  async function onSend() {
    if (!chatId || !content.trim()) return
    setActionError('')
    const text = content
    setContent('')
    try {
      const msg = await sendChatMessage(chatId, text)
      setMessages((prev) => [...prev, msg])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send')
    }
  }

  async function onResend(messageId: string) {
    if (!chatId || !messageId) return
    setActionError('')
    const clientIndex = messages.findIndex((m) => m.id === messageId)
    let targetAdminId = ''
    if (clientIndex >= 0) {
      for (let i = clientIndex + 1; i < messages.length; i += 1) {
        if (messages[i].sender === 'admin') {
          targetAdminId = messages[i].id
          break
        }
      }
    }

    const tempId = `resend-temp-${messageId}`
    setResendingId(messageId)
    setResendTargetId(targetAdminId)
    setResendTempId(targetAdminId ? '' : tempId)
    setMessages((prev) => {
      if (targetAdminId) {
        return prev.map((m) =>
          m.id === targetAdminId
            ? { ...m, content: 'Generating new reply...' }
            : m
        )
      }
      const pending: Message = {
        id: tempId,
        chat_id: chatId,
        sender: 'admin',
        content: 'Generating new reply...',
        created_at: new Date().toISOString(),
      }
      if (clientIndex < 0) return [...prev, pending]
      return [...prev.slice(0, clientIndex + 1), pending, ...prev.slice(clientIndex + 1)]
    })

    try {
      await resendClientMessage(chatId, messageId)
      // Fallback sync in case websocket event is delayed/lost.
      setTimeout(async () => {
        if (!chatId) return
        try {
          const data = await fetchChatMessages(chatId)
          setChat(data.chat)
          setMessages(data.messages)
          setResendingId('')
          setResendTargetId('')
          setResendTempId('')
        } catch {
          // keep optimistic state; ws may still deliver updates
        }
      }, 2200)
    } catch (err) {
      try {
        const data = await fetchChatMessages(chatId)
        setChat(data.chat)
        setMessages(data.messages)
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
      }
      setResendingId('')
      setResendTargetId('')
      setResendTempId('')
      setActionError(err instanceof Error ? err.message : 'Failed to resend to LLM')
    } finally {
      // keep loading state until ws/poll sync completes
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
          <div
            key={msg.id}
            className={`msg ${msg.sender === 'admin' ? 'right' : 'left'} ${msg.id === resendTargetId || msg.id === resendTempId ? 'msg-pending' : ''}`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {msg.content}
            </ReactMarkdown>
            {msg.id === resendTargetId || msg.id === resendTempId ? (
              <div className="msg-loading">Generating...</div>
            ) : null}
            <div className="msg-footer">
              <div className="msg-meta">{new Date(msg.created_at).toLocaleTimeString()}</div>
              {msg.sender === 'client' ? (
                <button
                  className="msg-resend-btn"
                  onClick={() => onResend(msg.id)}
                  disabled={resendingId === msg.id}
                >
                  {resendingId === msg.id ? 'Resending...' : 'Resend'}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {actionError ? <div className="muted" style={{ color: '#b00020', marginBottom: 8 }}>{actionError}</div> : null}
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
