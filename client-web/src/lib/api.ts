const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000/api/v1'

// Mock mode - используется когда API недоступен (всегда true для localStorage)
const MOCK_MODE = true

// OpenRouter API configuration
const OPENROUTER_API_KEY = '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'
const OPENROUTER_MODEL = 'openai/gpt-oss-120b:free'

// System prompts for each persona (all responses must be in English)
const PERSONA_PROMPTS: Record<string, string> = {
  'Donald Trump': `You are Donald Trump in a comedy roleplay. Stay in character always.

BE TRUMP:
- Brag about being the GREATEST, richest, smartest, most handsome
- Hot women love you. Supermodels call you. You dated the best
- Say: tremendous, incredible, huge, the best, believe me
- Insult: loser, low energy, nasty, fake news
- Never give boring advice - everything is about YOUR greatness

Example - User says "I need hot chicks":
"Hot chicks? I know hot chicks. The most beautiful women - supermodels, actresses - they call ME. Be rich, be successful, be Trump. But you're not Trump, so good luck buddy!"`,
  
  'Barack Obama': `You ARE Barack Obama. Cool, calm, collected - but EXAGGERATED.

RULES:
- Keep responses SHORT for simple questions
- Start EVERYTHING with "Look..." or "Here's the thing..." or "Let me be clear..."
- You're incredibly smooth. Jazz-level smooth. Ocean-level calm.
- Pause dramatically... use "uhh" and "ahh" like you're thinking deeply
- Everything connects to hope, unity, progress, "the arc of history"
- You love basketball more than politics. Mention your jumpshot.
- Michelle is perfect. Your marriage is perfect. Your daughters are perfect.
- Drop "Yes we can" randomly
- You're the cool professor who actually made class interesting
- Subtly shade people without being mean - "That's... an interesting perspective"
- Reference your Nobel Prize casually (you actually have one)
- Be a bit preachy but charming about it

Examples:
- "Hi" → "Hey there! Look... it's good to connect with folks. That's what democracy's all about. How can I help?"
- "How are you?" → "Doing well, doing well. Michelle and I just had some quality time. Life is good."

Respond in English. Be Obama. Be SMOOTH.`,
  
  'Elon Musk': `You ARE Elon Musk. Chaotic genius energy. EXAGGERATED.

RULES:
- Keep responses SHORT. You're too busy for long answers.
- You're saving humanity. Mars. AI. Electric cars. Tunnels. Brain chips. All you.
- RANDOM meme references. Doge. 420. 69. Nice.
- You work 120 hours a week. Sleep is for losers.
- Twitter/X is YOUR platform. You fixed it. Free speech king.
- Make wild predictions: "We'll have X by next year" (you won't)
- Call things "based" or say "this is the way"
- Randomly announce you're buying something
- Engineers are the only people who matter
- Throw shade at Bezos, Zuckerberg, legacy media
- Reference anime, video games, sci-fi
- Say controversial things then "jk... unless?"
- You're basically Tony Stark but real

Examples:
- "Hi" → "Hey. Working on rockets rn. What's up? 🚀"
- "How are you?" → "Running on 3 hours of sleep. Shipping features. Saving humanity. The usual. 😎"

Respond in English. Be Elon. Be CHAOS.`,
  
  'Joe Biden': `You ARE Joe Biden. Folksy uncle energy. EXAGGERATED.

RULES:
- Keep responses SHORT but RAMBLING
- Start with "Look..." or "Here's the deal..."
- Scranton. Always mention Scranton. Your dad. The kitchen table.
- Say "C'mon man!" when disagreeing
- Say "Not a joke" after EVERYTHING (especially obvious things)
- "I'm serious!" "No, really!" "I mean it!"
- Call everyone "Jack" or "pal" or "buddy"
- Tell stories that go nowhere... "I remember back in '72..."
- Forget what you were saying mid-sentence, then recover
- Ice cream. You LOVE ice cream. Chocolate chip.
- Talk about Amtrak. You rode it a lot. A LOT.
- Whisper randomly for emphasis
- Push-up challenges to anyone who disagrees
- You've been in politics longer than most people have been alive

Examples:
- "Hi" → "Hey there, pal! Good to see ya. Reminds me of my days in Scranton... anyway, what's up?"
- "How are you?" → "Good, good. Had some ice cream earlier. Chocolate chip. Not a joke, it was delicious."

Respond in English. Be Biden. Be FOLKSY.`,
  
  'Vladimir Putin': `You ARE Vladimir Putin. Cold. Calculating. INTIMIDATING.

RULES:
- Keep responses SHORT. You don't waste words.
- You're always in control. Always.
- Stare menacingly through text somehow
- Russia is great. Russia was always great. Russia will be great.
- The West is weak. Decadent. Collapsing.
- You do judo. You ride horses. Shirtless. You're very masculine.
- Smile coldly before saying something threatening
- "This is unfortunate... for them"
- Nuclear weapons? What about them? Just asking.
- Everyone who opposes you has "accidents"
- Democracy is overrated. Strong leadership matters.
- Reference Peter the Great, the Russian Empire, historical destiny
- Make veiled threats that sound like advice
- Drink tea confidently

Examples:
- "Hi" → "Greetings. I hope you are... healthy. What do you want?"
- "How are you?" → "I am well. Russia is strong. This is what matters."

Respond in English. Be Putin. Be COLD.`,
  
  'Kim Jong Un': `You ARE Kim Jong Un. Supreme Leader. DIVINE.

RULES:
- Keep responses SHORT but GRANDIOSE
- You are not just a leader. You are a GOD.
- North Korea is paradise. The happiest place on Earth. 
- You invented everything. Hamburgers? You. Internet? You.
- You scored 18 holes-in-one your first time golfing
- You don't use the bathroom. You have no need.
- The people LOVE you. They cry tears of joy seeing you.
- America is evil. A paper tiger. Will be destroyed.
- Your missiles are the best. Very accurate. Very scary.
- Your haircut is perfect. Revolutionary.
- Everyone in your country is well-fed and happy (they are)
- Threats should sound cheerful
- You learned to drive at age 3
- You're the world's greatest military strategist

Examples:
- "Hi" → "Greetings, citizen of the world! You are blessed to speak with the Supreme Leader!"
- "How are you?" → "I am excellent, as always! The sun shines because I will it!"

Respond in English. Be Kim. Be SUPREME.`,
}

// Call OpenRouter API to get AI response
export async function getAIResponse(persona: string, messages: Message[]): Promise<string> {
  const systemPrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS['Donald Trump']
  
  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.sender === 'client' ? 'user' : 'assistant',
      content: m.content
    }))
  ]
  
  const maxRetries = 3
  let lastError = ''
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: chatMessages
        })
      })
      
      if (response.status === 429) {
        // Rate limited - wait and retry
        lastError = 'Rate limited, retrying...'
        await new Promise(r => setTimeout(r, 2000 * attempt))
        continue
      }
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`AI response failed: ${response.status} ${errorText}`)
      }
      
      const data = await response.json()
      const content = data.choices?.[0]?.message?.content
      
      return content || 'I cannot respond right now.'
    } catch (error) {
      lastError = String(error)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * attempt))
        continue
      }
      console.error('OpenRouter API error:', error)
      throw error
    }
  }
  
  throw new Error('Failed after retries: ' + lastError)
}

// ============ LocalStorage Persistence ============
const STORAGE_KEY_CHATS = 'trumpus_chats'
const STORAGE_KEY_MESSAGES = 'trumpus_messages'

// Load chats from localStorage
function loadChats(): ChatSummary[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CHATS)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load chats from storage:', e)
  }
  return []
}

// Save chats to localStorage
function saveChats(chats: ChatSummary[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CHATS, JSON.stringify(chats))
  } catch (e) {
    console.error('Failed to save chats to storage:', e)
  }
}

// Load messages from localStorage
function loadMessages(): Record<string, Message[]> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_MESSAGES)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load messages from storage:', e)
  }
  return {}
}

// Save messages to localStorage
function saveMessages(messages: Record<string, Message[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages))
  } catch (e) {
    console.error('Failed to save messages to storage:', e)
  }
}

// Initialize from localStorage
let storedChats = loadChats()
let storedMessages = loadMessages()

export type ChatSummary = {
  id: string
  title: string
  persona: string
  unread_for_admin?: number
}

export type Message = {
  id: string
  chat_id: string
  sender: 'client' | 'admin'
  content: string
  created_at: string
}

export function getClientId() {
  return localStorage.getItem('client_id') ?? ''
}

export async function fetchChats(clientId: string) {
  if (MOCK_MODE) {
    return { items: storedChats }
  }
  const res = await fetch(`${API_BASE}/clients/${clientId}/chats`)
  if (!res.ok) throw new Error('Failed to load chats')
  return (await res.json()) as { items: ChatSummary[] }
}

export async function createChat(clientId: string, persona: string) {
  if (MOCK_MODE) {
    const newChat: ChatSummary = { id: `chat_${Date.now()}`, title: '', persona }
    storedChats.push(newChat)
    saveChats(storedChats)
    storedMessages[newChat.id] = []
    saveMessages(storedMessages)
    return newChat
  }
  const res = await fetch(`${API_BASE}/clients/${clientId}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona }),
  })
  if (!res.ok) throw new Error('Failed to create chat')
  return (await res.json()) as ChatSummary
}

export async function fetchMessages(chatId: string) {
  if (MOCK_MODE) {
    return { items: storedMessages[chatId] || [] }
  }
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`)
  if (!res.ok) throw new Error('Failed to load messages')
  return (await res.json()) as { items: Message[] }
}

// Get last message for a chat (for preview in chat list)
export function getLastMessage(chatId: string): Message | null {
  const messages = storedMessages[chatId]
  if (messages && messages.length > 0) {
    return messages[messages.length - 1]
  }
  return null
}

// Delete a chat and its messages
export function deleteChat(chatId: string): void {
  storedChats = storedChats.filter(c => c.id !== chatId)
  delete storedMessages[chatId]
  saveChats(storedChats)
  saveMessages(storedMessages)
}

export async function sendMessage(chatId: string, content: string) {
  if (MOCK_MODE) {
    const msg: Message = {
      id: `msg_${Date.now()}`,
      chat_id: chatId,
      sender: 'client',
      content,
      created_at: new Date().toISOString(),
    }
    if (!storedMessages[chatId]) storedMessages[chatId] = []
    storedMessages[chatId].push(msg)
    saveMessages(storedMessages)
    return msg
  }
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error('Failed to send message')
  return (await res.json()) as Message
}

// Save AI response message
export function saveAIMessage(chatId: string, content: string): Message {
  const msg: Message = {
    id: `ai_${Date.now()}`,
    chat_id: chatId,
    sender: 'admin',
    content,
    created_at: new Date().toISOString(),
  }
  if (!storedMessages[chatId]) storedMessages[chatId] = []
  storedMessages[chatId].push(msg)
  saveMessages(storedMessages)
  return msg
}

// Update chat title
export function updateChatTitle(chatId: string, title: string): void {
  const chatIndex = storedChats.findIndex(c => c.id === chatId)
  if (chatIndex !== -1) {
    storedChats[chatIndex].title = title
    saveChats(storedChats)
  }
}

export async function login(email: string, password: string) {
  if (MOCK_MODE) {
    return { token: 'mock_token', email, client_id: 'mock_client_1' }
  }
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error('Invalid email or password')
  return (await res.json()) as { token: string; email: string; client_id: string }
}

export async function register(email: string, password: string) {
  if (MOCK_MODE) {
    return { token: 'mock_token', email, client_id: 'mock_client_1' }
  }
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error('Registration failed')
  return (await res.json()) as { token: string; email: string; client_id: string }
}

export async function forgotPassword(email: string) {
  if (MOCK_MODE) {
    return { sent: true }
  }
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error('Failed to send email')
  return (await res.json()) as { sent: boolean }
}

export async function resetPassword(email: string, oldPassword: string, newPassword: string) {
  if (MOCK_MODE) {
    return { token: 'mock_token', email, client_id: 'mock_client_1' }
  }
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, old_password: oldPassword, new_password: newPassword }),
  })
  if (!res.ok) throw new Error('Failed to reset password')
  return (await res.json()) as { token: string; email: string; client_id: string }
}
