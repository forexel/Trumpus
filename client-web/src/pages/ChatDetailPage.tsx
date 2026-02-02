import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchChats, fetchMessages, getClientId, sendMessage, getAIResponse, saveAIMessage, updateChatTitle, Message, ChatSummary } from '../lib/api'
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
  const [assistantDraft, setAssistantDraft] = useState('')
  const navigate = useNavigate()
  const intervalRef = useRef<number | null>(null)
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
    setLoading(true)
    Promise.all([fetchChats(clientId), fetchMessages(chatId)])
      .then(([chatList, msgList]) => {
        const found = chatList.items.find((c) => c.id === chatId) ?? null
        setChat(found)
        setMessages(msgList.items)
      })
      .finally(() => setLoading(false))
  }, [chatId, navigate])

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, assistantDraft])

  // Focus input on mount
  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus()
    }
  }, [loading])

  function startTypewriter(fullText: string, aiMsg: Message) {
    setAssistantDraft('')
    let index = 0
    const speed = Math.max(10, Math.min(30, 1500 / fullText.length)) // Adaptive speed
    intervalRef.current = window.setInterval(() => {
      index += 2
      setAssistantDraft(fullText.slice(0, index))
      if (index >= fullText.length) {
        if (intervalRef.current) window.clearInterval(intervalRef.current)
        intervalRef.current = null
        setAssistantDraft('')
        setMessages(prev => {
          if (prev.some(m => m.id === aiMsg.id)) return prev
          return [...prev, aiMsg]
        })
        setTyping(false)
        pendingAIRef.current = false
      }
    }, speed)
  }

  async function onSend() {
    if (!text.trim() || !chatId || typing || pendingAIRef.current) return
    const content = text
    setText('')
    pendingAIRef.current = true
    
    const msg = await sendMessage(chatId, content)
    const updatedMessages = [...messages, msg]
    setMessages(updatedMessages)
    
    // Update title if first message
    if (!chat?.title) {
      const newTitle = makeChatTitle(content)
      updateChatTitle(chatId, newTitle)
      setChat(prev => prev ? { ...prev, title: newTitle } : prev)
    }
    
    // Get AI response
    setTyping(true)
    try {
      const persona = chat?.persona || 'Donald Trump'
      const aiResponse = await getAIResponse(persona, updatedMessages)
      const aiMsg = saveAIMessage(chatId, aiResponse)
      startTypewriter(aiResponse, aiMsg)
    } catch (error) {
      console.error('Failed to get AI response:', error)
      setTyping(false)
      pendingAIRef.current = false
      // Show error as a message
      const errorContent = "⚠️ Server is busy. Please try again in a moment."
      const errorMsg = saveAIMessage(chatId, errorContent)
      setMessages(prev => [...prev, errorMsg])
    }
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
        <button className="back-btn" onClick={() => navigate('/chats')} aria-label="Back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
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
          {theme === 'dark' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
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
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      <div className="composer-bottom">
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
