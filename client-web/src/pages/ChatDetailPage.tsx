import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchChats, fetchMessages, getClientId, sendMessage, updateChatTitle, setLastChatId, Message, ChatSummary } from '../lib/api'
import { useTheme } from '../lib/useTheme'
import { PERSONAS } from './NewChatPage'
import eagleIcon from '../assets/eagle.png'

// Get persona data by name
function getPersonaByName(name: string) {
  return PERSONAS.find(p => p.name === name) || null
}

// Generate initials for placeholder avatar
function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase()
}

function makeChatTitle(text: string, limit = 36) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'New Chat'
  if (cleaned.length <= limit) return cleaned
  return `${cleaned.slice(0, limit - 1)}…`
}

// Format time for message
function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function ChatDetailPage() {
  const { id } = useParams()
  const chatId = id ?? ''
  const [chat, setChat] = useState<ChatSummary | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [typing, setTyping] = useState(false)
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pendingAIRef = useRef(false)
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    const clientId = getClientId()
    if (!clientId) {
      navigate('/login')
      return
    }
    if (chatId) setLastChatId(chatId)
    setLoading(true)
    Promise.all([fetchChats(clientId), fetchMessages(chatId)])
      .then(([chatList, msgList]) => {
        const found = chatList.items.find((c) => c.id === chatId) ?? null
        if (!found) {
          navigate('/chats', { replace: true })
          return
        }
        setChat(found)
        setMessages(msgList.items)
      })
      .catch(() => {
        navigate('/chats', { replace: true })
      })
      .finally(() => setLoading(false))
  }, [chatId, navigate])


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus()
    }
  }, [loading])

  async function pollForAI(chatID: string, previousCount: number) {
    const maxAttempts = 20
    for (let i = 0; i < maxAttempts; i += 1) {
      await new Promise(r => setTimeout(r, 1000))
      const res = await fetchMessages(chatID)
      if (res.items.length > previousCount) {
        setMessages(res.items)
        setTyping(false)
        pendingAIRef.current = false
        return
      }
    }
    setTyping(false)
    pendingAIRef.current = false
  }

  async function onSend() {
    if (!text.trim() || !chatId || typing || pendingAIRef.current) return
    const content = text
    setText('')
    pendingAIRef.current = true
    
    const msg = await sendMessage(chatId, content, persona)
    const updatedMessages = [...messages, msg]
    setMessages(updatedMessages)
    
    // Update title if first message
    if (!chat?.title) {
      const newTitle = makeChatTitle(content)
      updateChatTitle(chatId, newTitle)
      setChat(prev => prev ? { ...prev, title: newTitle } : prev)
    }
    
    // Wait for LLM response via API
    setTyping(true)
    pollForAI(chatId, updatedMessages.length)
  }

  const markdownComponents = useMemo(
    () => ({
      p: ({ children }: { children?: React.ReactNode }) => <p className="bubble-text">{children}</p>,
      ul: ({ children }: { children?: React.ReactNode }) => <ul className="bubble-list">{children}</ul>,
      ol: ({ children }: { children?: React.ReactNode }) => <ol className="bubble-list">{children}</ol>,
      li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
      strong: ({ children }: { children?: React.ReactNode }) => <strong className="bubble-strong">{children}</strong>,
    }),
    []
  )

  const persona = chat?.persona ? getPersonaByName(chat.persona) : null
  const displayTitle = chat?.title || (persona ? persona.name : 'New Chat')

  return (
    <div className="mobile-page chat-page">
      <header className="mobile-header chat-header">
        <button className="back-btn" onClick={() => navigate('/chats')} aria-label="Back" />
        <span className="header-flag">🇺🇸</span>
        <div className="header-title header-chat">
          {persona ? (
            persona.avatar ? (
              <img className="header-avatar" src={persona.avatar} alt={persona.name} />
            ) : (
              <span className="header-avatar header-avatar-placeholder" style={{ backgroundColor: persona.color }}>
                {getInitials(persona.name)}
              </span>
            )
          ) : null}
          <div className="header-info">
            <span className="header-name">{displayTitle}</span>
            <span className={`header-status ${typing ? 'typing' : ''}`}>
              {typing ? 'typing...' : 'online'}
            </span>
          </div>
        </div>
        <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          <span className="theme-icon theme-icon-moon" aria-hidden="true" />
          <span className="theme-icon theme-icon-sun" aria-hidden="true" />
        </button>
      </header>

      <main className="chat-messages">
        {loading ? (
          <div className="loading-state">
            <img src={eagleIcon} alt="Loading" className="eagle-loader" />
            <span>Loading...</span>
          </div>
        ) : (
          <div className="bubble-list-wrap">
            {messages.length === 0 && !typing && (
              <div className="empty-chat-hint">
                <p>Start chatting with {persona?.name || 'your AI friend'}!</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`bubble ${m.sender === 'client' ? 'user' : 'ai'}`}>
                {m.sender === 'client' ? (
                  <>
                    <div className="bubble-text">{m.content}</div>
                    <div className="bubble-time">{formatTime(m.created_at)}</div>
                  </>
                ) : (
                  <>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {m.content}
                    </ReactMarkdown>
                    <div className="bubble-time">{formatTime(m.created_at)}</div>
                  </>
                )}
              </div>
            ))}
            {typing && (
              <div className="bubble ai typing">
                <div className="typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      <div className="composer-bottom composer-fixed">
        <input
          ref={inputRef}
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
          disabled={typing}
        />
        <button 
          className="send-btn eagle-btn" 
          onClick={onSend} 
          disabled={!text.trim() || typing}
          aria-label="Send"
        >
          <img src={eagleIcon} alt="Send" className={`eagle-send-icon ${typing ? 'flying' : ''}`} />
        </button>
      </div>
    </div>
  )
}
