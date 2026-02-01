import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchChats, fetchMessages, getClientId, sendMessage, Message, ChatSummary } from '../lib/api'
import trumpAvatar from '../assets/trump.png'
import obamaAvatar from '../assets/obama.png'

const PERSONA_AVATARS: Record<string, string> = {
  'Donald Trump': trumpAvatar,
  'Barack Obama': obamaAvatar,
}

const DEMO_RESPONSE = `Ок, понял. Давайте так:\n\n- Сначала уточним детали\n- Потом предложу решение\n\nЕсли нужно — распишу пошагово.`

function makeChatTitle(text: string, limit = 36) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'New Chat'
  if (cleaned.length <= limit) return cleaned
  return `${cleaned.slice(0, limit - 1)}…`
}

export default function ChatDetailPage() {
  const { id } = useParams()
  const chatId = id ?? ''
  const [chat, setChat] = useState<ChatSummary | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [typing, setTyping] = useState(false)
  const [assistantDraft, setAssistantDraft] = useState('')
  const navigate = useNavigate()
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    const clientId = getClientId()
    if (!clientId) {
      navigate('/login')
      return
    }
    setLoading(true)
    Promise.all([fetchChats(clientId), fetchMessages(chatId)])
      .then(([chatList, msgList]) => {
        setChat(chatList.items.find((c) => c.id === chatId) ?? null)
        setMessages(msgList.items)
      })
      .finally(() => setLoading(false))
  }, [chatId, navigate])

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
  }, [])

  function startTypewriter(fullText: string) {
    setAssistantDraft('')
    let index = 0
    intervalRef.current = window.setInterval(() => {
      index += 2
      setAssistantDraft(fullText.slice(0, index))
      if (index >= fullText.length) {
        if (intervalRef.current) window.clearInterval(intervalRef.current)
        intervalRef.current = null
        setMessages((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            chat_id: chatId,
            sender: 'admin',
            content: fullText,
            created_at: new Date().toISOString(),
          },
        ])
        setAssistantDraft('')
        setTyping(false)
      }
    }, 20)
  }

  async function onSend() {
    if (!text.trim() || !chatId) return
    const content = text
    setText('')
    const msg = await sendMessage(chatId, content)
    setMessages((prev) => [...prev, msg])
    setChat((prev) => {
      if (!prev) return prev
      if (prev.title) return prev
      return { ...prev, title: makeChatTitle(content) }
    })
    setTyping(true)
    startTypewriter(DEMO_RESPONSE)
  }

  const markdownComponents = useMemo(
    () => ({
      p: ({ children }: { children: React.ReactNode }) => <p className="bubble-text">{children}</p>,
      ul: ({ children }: { children: React.ReactNode }) => <ul className="bubble-list">{children}</ul>,
      ol: ({ children }: { children: React.ReactNode }) => <ol className="bubble-list">{children}</ol>,
      li: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
      strong: ({ children }: { children: React.ReactNode }) => <strong className="bubble-strong">{children}</strong>,
    }),
    []
  )

  return (
    <div className="mobile-page">
      <header className="mobile-header">
        <button className="back-btn" onClick={() => navigate('/chats')} aria-label="Back">
          ←
        </button>
        <div className="header-title header-chat">
          {chat?.persona && PERSONA_AVATARS[chat.persona] ? (
            <img className="header-avatar" src={PERSONA_AVATARS[chat.persona]} alt={chat.persona} />
          ) : null}
          <span>{chat?.title || 'New Chat'}</span>
        </div>
        <div className="header-spacer" />
      </header>

      <main className="mobile-content chat-view">
        <div className="chat-head">
          <div className="avatar">
            {chat?.persona && PERSONA_AVATARS[chat.persona] ? (
              <img src={PERSONA_AVATARS[chat.persona]} alt={chat.persona} />
            ) : (
              <span>{chat?.persona?.[0] ?? 'AI'}</span>
            )}
          </div>
          <div className="chat-head-title">{chat?.title || 'Chat'}</div>
        </div>

        {loading ? (
          <div className="loading-text">Loading...</div>
        ) : (
          <div className="bubble-list-wrap">
            {messages.map((m) => (
              <div key={m.id} className={`bubble ${m.sender === 'client' ? 'user' : 'ai'}`}>
                {m.sender === 'client' ? (
                  <div className="bubble-text">{m.content}</div>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {m.content}
                  </ReactMarkdown>
                )}
              </div>
            ))}
            {typing ? (
              <div className="bubble ai">
                {assistantDraft ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {assistantDraft}
                  </ReactMarkdown>
                ) : (
                  <div className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        <div className="composer floating">
          <input
            placeholder="Ask me something"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="send-btn" onClick={onSend}>
            ↑
          </button>
        </div>
      </main>
    </div>
  )
}
