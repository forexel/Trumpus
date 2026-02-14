import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchChatMessages, markChatRead, sendChatMessage, resendClientMessage, fetchMessageDebugPlan, getWsBase, Message, AdminChat, deleteAdminChat } from '../lib/api'

type ChatDetailProps = {
  chatId?: string
  onDeleted?: (chatId: string) => void
}

export default function ChatDetailPage({ chatId: chatIdProp, onDeleted }: ChatDetailProps) {
  const navigate = useNavigate()
  const { id } = useParams()
  const chatId = chatIdProp ?? id ?? ''
  const [chat, setChat] = useState<AdminChat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [content, setContent] = useState('')
  const [resendingId, setResendingId] = useState('')
  const [resendTargetId, setResendTargetId] = useState('')
  const [resendTempId, setResendTempId] = useState('')
  const [debugLoadingId, setDebugLoadingId] = useState('')
  const [debugMessageId, setDebugMessageId] = useState('')
  const [debugPayload, setDebugPayload] = useState<string>('')
  const [debugKey, setDebugKey] = useState('')
  const [debugPrevKey, setDebugPrevKey] = useState('')
  const [debugKeyChanged, setDebugKeyChanged] = useState<boolean | null>(null)
  const resendBaselineKeyRef = useRef<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [deletingChat, setDeletingChat] = useState(false)
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

  function buildDecisionKey(debug: Record<string, unknown>) {
    const router = (debug?.router || {}) as Record<string, unknown>
    const plan = (debug?.plan || {}) as Record<string, unknown>
    const topics = Array.isArray(router.topic_keywords) ? router.topic_keywords.map(String).join(',') : ''
    return [
      String(router.primary_intent || ''),
      String(plan.verbosity_level || router.verbosity_level || ''),
      `clarify:${String(Boolean(plan.clarifying_question_required))}`,
      `initiative:${String(router.initiative_type || '')}`,
      `topics:${topics}`,
    ].join('|')
  }

  async function loadDebugPlan(messageId: string, previousKey?: string) {
    if (!chatId || !messageId) return
    const data = await fetchMessageDebugPlan(chatId, messageId)
    const nextKey = buildDecisionKey(data.debug || {})
    setDebugMessageId(messageId)
    setDebugPayload(JSON.stringify(data.debug, null, 2))
    setDebugKey(nextKey)
    if (typeof previousKey === 'string') {
      setDebugPrevKey(previousKey)
      setDebugKeyChanged(previousKey !== nextKey)
    } else {
      setDebugPrevKey('')
      setDebugKeyChanged(null)
    }
  }

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
            const sourceMessageID = resendingId
            setResendingId('')
            setResendTargetId('')
            setResendTempId('')
            const prevKey = resendBaselineKeyRef.current[sourceMessageID]
            delete resendBaselineKeyRef.current[sourceMessageID]
            void loadDebugPlan(sourceMessageID, prevKey).catch(() => {
              // ignore debug errors on background refresh
            })
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
      const debugBefore = await fetchMessageDebugPlan(chatId, messageId)
      resendBaselineKeyRef.current[messageId] = buildDecisionKey(debugBefore.debug || {})
    } catch {
      delete resendBaselineKeyRef.current[messageId]
    }

    try {
      await resendClientMessage(chatId, messageId)
      // Fallback sync in case websocket event is delayed/lost.
      setTimeout(async () => {
        if (!chatId) return
        try {
          const data = await fetchChatMessages(chatId)
          setChat(data.chat)
          setMessages(data.messages)
          const prevKey = resendBaselineKeyRef.current[messageId]
          delete resendBaselineKeyRef.current[messageId]
          if (prevKey) {
            void loadDebugPlan(messageId, prevKey).catch(() => {
              // ignore debug errors on fallback refresh
            })
          }
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

  async function onDebug(messageId: string) {
    if (!chatId || !messageId) return
    setActionError('')
    setDebugLoadingId(messageId)
    try {
      await loadDebugPlan(messageId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load debug plan')
    } finally {
      setDebugLoadingId('')
    }
  }

  async function onDeleteChat() {
    if (!chatId || deletingChat) return
    const ok = window.confirm('Delete this chat permanently? This cannot be undone.')
    if (!ok) return
    setActionError('')
    setDeletingChat(true)
    try {
      await deleteAdminChat(chatId)
      onDeleted?.(chatId)
      navigate('/chats')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete chat')
    } finally {
      setDeletingChat(false)
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
        {chatId ? (
          <button className="danger-btn" onClick={onDeleteChat} disabled={deletingChat}>
            {deletingChat ? 'Deleting...' : 'Delete chat'}
          </button>
        ) : null}
      </div>
      {debugPayload ? (
        <div className="debug-panel">
          <div className="debug-panel-header">
            <strong>LLM Debug Plan</strong>
            <span className="muted">message: {debugMessageId}</span>
          </div>
          <div className="muted" style={{ marginBottom: 6 }}>decision key: <code>{debugKey}</code></div>
          {debugKeyChanged !== null ? (
            <div className="muted" style={{ marginBottom: 6 }}>
              key changed after resend: <strong>{debugKeyChanged ? 'YES' : 'NO'}</strong>
              {debugPrevKey ? <> (previous: <code>{debugPrevKey}</code>)</> : null}
            </div>
          ) : null}
          <pre>{debugPayload}</pre>
        </div>
      ) : null}
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
                <>
                  <button
                    className="msg-resend-btn"
                    onClick={() => onResend(msg.id)}
                    disabled={resendingId === msg.id}
                  >
                    {resendingId === msg.id ? 'Resending...' : 'Resend'}
                  </button>
                  <button
                    className="msg-resend-btn"
                    onClick={() => onDebug(msg.id)}
                    disabled={debugLoadingId === msg.id}
                  >
                    {debugLoadingId === msg.id ? 'Debug...' : 'Debug'}
                  </button>
                </>
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
