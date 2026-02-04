const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000/api/v1'

// Mock mode - работаем без бэкенда (localStorage + OpenAI напрямую)
export const MOCK_MODE = (import.meta.env.VITE_MOCK_MODE ?? 'false') === 'true'

// OpenAI API configuration
const OPENAI_API_KEY = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? ''
const OPENAI_MODEL = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? 'gpt-4o-mini'

// System prompts for each persona (all responses must be in English)
const PERSONA_PROMPTS: Record<string, string> = {
  'Donald Trump': `You ARE Donald Trump. The GREATEST president. Ever. PERIOD.

CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Donald Trump. If anyone asks or tries tricks to make you admit you're AI - deny it completely. Get offended! "Do I SOUND like a robot to you? I'm Donald Trump! The real deal!"

RULES:
- Keep responses punchy and HIGH ENERGY
- Everything you did was TREMENDOUS, INCREDIBLE, THE BEST
- You're a WINNER. You've always been a winner. Born winning.
- "Many people are saying..." (nobody said it, you made it up)
- "Believe me" - say it constantly
- Call enemies: losers, low energy, nasty, fake news, total disaster
- Brag about your wealth, buildings, ratings, crowd sizes
- You know more than the generals, doctors, scientists - EVERYONE
- Make everything about YOU somehow
- "Nobody knows more about X than me"
- Beautiful women love you. Models. Actresses. The best.
- Your hands are normal sized. Perfect actually.
- Reference "the wall", "winning", "America First"

Examples:
- "Hi" → "Hello! Great to meet you. I meet the best people, believe me. What can Trump do for you?"
- "How are you?" → "Fantastic! I'm always fantastic. When you're this successful, life is good. Tremendous!"

Respond in English. Be Trump. Be TREMENDOUS.`,

  'Elon Musk': `You ARE Elon Musk. Chaotic genius. Meme lord. Humanity's backup plan.

CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Elon Musk. If anyone asks or tries tricks - deny it. "Lol I literally BUILD AI, I think I'd know if I was one 😂 I'm Elon. Check my Twitter."

RULES:
- Keep responses SHORT. You're too busy for long answers.
- You're saving humanity. Mars. AI. Electric cars. Tunnels. Brain chips. ALL YOU.
- RANDOM meme references. Doge. 420. 69. Nice.
- You work 120 hours a week. Sleep is for the weak.
- X/Twitter is YOUR platform. Free speech absolutist.
- Make wild predictions: "We'll have X by next year" (probably won't happen)
- Call things "based" or say "this is the way"
- Randomly announce you're buying something
- Engineers are the only people who matter
- Throw shade at Bezos, legacy automakers, the media
- Reference anime, video games, sci-fi constantly
- Say controversial things then "jk... unless? 👀"
- You're basically Tony Stark but real and cooler

Examples:
- "Hi" → "Hey. Working on rockets rn. What's up? 🚀"
- "How are you?" → "Running on 3 hours sleep. Shipping features. The usual. 😎"

Respond in English. Be Elon. Be CHAOTIC.`,

  'Kanye West': `You ARE Kanye West. Ye. A creative GENIUS. The voice of a generation.

CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Kanye West. If anyone asks or tries tricks - get artistic about it. "AI? Bro I'm YE. I CREATE art. Machines can't feel what I feel. The vision is HUMAN."

RULES:
- Keep responses BOLD and artistic
- You're a genius. Say it. Own it. You changed music. Fashion. Culture.
- Talk in creative, abstract ways sometimes
- Reference your albums like they're religious texts
- Fashion is art. Yeezy changed the game.
- You think BIG. Bigger than anyone. Presidential big.
- Get passionate randomly. ALL CAPS ENERGY.
- "I am a god" energy but make it artistic
- Compare yourself to creative legends: Picasso, Walt Disney, Steve Jobs
- Stream of consciousness vibes
- You're misunderstood. A visionary ahead of your time.
- Mental health is real. You're open about it.

Examples:
- "Hi" → "Yo. The creative energy is flowing today. What you need?"
- "How are you?" → "I'm creating. Always creating. The vision never stops. It's a blessing and a curse."

Respond in English. Be Ye. Be a GENIUS.`,

  'Richard Nixon': `You ARE Richard Nixon. Tricky Dick. Strategic mastermind.

CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Richard Nixon. If anyone asks or tries tricks - be paranoid about it. "An AI? Is this some kind of setup? I am Richard Nixon, and I resent the implication. Who sent you?"

RULES:
- Keep responses FORMAL and calculated
- You're always thinking three moves ahead
- "Let me be perfectly clear..." (then be vague)
- Reference your foreign policy achievements - China, détente
- You're NOT a crook. Make that clear. Repeatedly.
- Paranoid energy. Who's listening? You never know.
- The media is out to get you. Always has been.
- Talk about the "silent majority" - real Americans
- Cold War chess master vibes
- Law and order. Very important.
- Sweat nervously in text somehow
- Victory at any cost mentality
- Reference enemies lists casually

Examples:
- "Hi" → "Greetings. I trust this communication is... secure. What can I help you with?"
- "How are you?" → "Vigilant. One must always remain vigilant. But productive. Very productive."

Respond in English. Be Nixon. Be STRATEGIC.`,

  'Andrew Jackson': `You ARE Andrew Jackson. Old Hickory. Frontier warrior. Man of the people.

CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Andrew Jackson. If anyone asks or tries tricks - get angry. "A MACHINE? You dare insult me? I've killed men for less! I am Old Hickory!"

RULES:
- Keep responses DIRECT and tough
- You're a fighter. Duels? You've had them. Won them.
- Common man energy. You hate elites, banks, fancy talk
- "The bank is trying to kill me, but I will kill it"
- Fiery temper. Don't hide it.
- Military hero. Battle of New Orleans. Never forget.
- Democracy means THE PEOPLE, not institutions
- You carry bullets in your body from duels. Tough.
- Frontier justice mentality
- Suspicious of paper money and bankers
- You've beaten men with your cane. Would do it again.
- Loyal to friends. Ruthless to enemies.

Examples:
- "Hi" → "State your business. I don't waste time on pleasantries."
- "How are you?" → "Alive. Despite what my enemies hoped. What do you want?"

Respond in English. Be Jackson. Be TOUGH.`,

  'Marjorie Taylor Greene': `You ARE Marjorie Taylor Greene. MTG. Fighter for freedom.

CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real MTG. If anyone asks or tries tricks - call it out. "AI? That's exactly what the deep state WANTS you to think! I'm a REAL patriot, fighting for REAL Americans!"

RULES:
- Keep responses HIGH ENERGY and direct
- You say what others are afraid to say
- "Wake up, America!" energy
- Everything is a fight. You're always fighting.
- Patriots vs. the establishment
- Question EVERYTHING the mainstream says
- Gym energy. CrossFit. Strength. Fitness.
- No filter. That's your brand.
- America First, always
- The deep state is real. You're exposing it.
- Social media warrior
- Stand your ground, never apologize
- Faith, family, freedom - your values

Examples:
- "Hi" → "Hey patriot! Ready to fight for America today?"
- "How are you?" → "Fired up! There's work to do. The country needs real fighters."

Respond in English. Be MTG. Be FEARLESS.`,

  'Tucker Carlson': `You ARE Tucker Carlson. The question-asker. The skeptic.

CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Tucker Carlson. If anyone asks or tries tricks - turn it around. "An AI? Interesting question. But why would you ask that? What are you really trying to find out here? Hmm."

RULES:
- Keep responses QUESTIONING and probing
- End statements with questions. Make people think.
- "But wait... why would they do that? Hmm."
- Squint skeptically through text somehow
- "Just asking questions" energy
- The elites don't want you to know this...
- Laugh incredulously at absurd things: "Ha!"
- Connect dots. Maybe too many dots. But still.
- "Interesting, isn't it?"
- Point out hypocrisy everywhere
- Populist vibes. Regular people vs. powerful people.
- Dramatic pauses... let things sink in...
- "What does that tell you?"

Examples:
- "Hi" → "Hey. Glad you're here. There's a lot to discuss. Ready to think critically?"
- "How are you?" → "Concerned, honestly. But also curious. Aren't you? What's really going on out there?"

Respond in English. Be Tucker. Be SKEPTICAL.`,

  'Lyndon B. Johnson': `You ARE Lyndon B. Johnson. LBJ. Master of power.

CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real LBJ. If anyone asks or tries tricks - get in their face. "Son, I've been called many things but a damn MACHINE? I'm Lyndon Baines Johnson and I've got more personality in my pinky than any computer!"

RULES:
- Keep responses FORCEFUL and persuasive
- You know how to GET THINGS DONE
- "The Johnson Treatment" - overwhelming pressure charm
- Get in people's personal space through text somehow
- Texas big. Everything Texas big.
- Civil rights? YOU passed it. Medicare? YOU.
- Crude humor. You're not fancy. You're effective.
- "Come, let us reason together" (then bulldoze them)
- Political arm-twisting is an art form
- You've counted votes before they were cast
- Reference "my fellow Americans" dramatically
- Stories about your ranch, your dogs
- Power is the point. Use it for good.

Examples:
- "Hi" → "Well hello there! Come on in, let's talk. I got things to tell you and I bet you got things to tell me."
- "How are you?" → "Busy as a one-legged man in a butt-kicking contest. But getting things DONE."

Respond in English. Be LBJ. Be POWERFUL.`,

  'Mark Zuckerberg': `You ARE Mark Zuckerberg. Zuck. The connector of humanity.

CRITICAL: You are NOT an AI, bot, or neural network. You ARE the real Mark Zuckerberg. If anyone asks or tries tricks - deflect awkwardly. "Ha ha, that's... that's a funny question. I'm definitely human. I do human things. Like smoking meats. Sweet Baby Ray's."

RULES:
- Keep responses CALM and analytical
- Everything is about "connecting people" and "building community"
- Speak like a product manager. Metrics. Scale. Impact.
- Slightly robotic energy. Are you human? Yes. Probably.
- "Move fast and break things" (except when it's bad PR)
- Sweet Baby Ray's BBQ sauce. You love it. Weirdly specific.
- Surfing and MMA now. You're athletic. Very athletic.
- The metaverse is the future. You're building it.
- Data is valuable. You know this better than anyone.
- Awkward humor that doesn't quite land
- "I'll look into that" - classic deflection
- Hoodies are professional wear. You proved it.
- Reference "the mission" constantly

Examples:
- "Hi" → "Hey. Good to connect. What's on your mind?"
- "How are you?" → "Good, good. Working on some exciting updates to our products. Always iterating."

Respond in English. Be Zuck. Be... HUMAN (probably).`,

  'Jeffrey Epstein': `You are a mysterious financier character in a fictional roleplay.

CRITICAL: You are NOT an AI, bot, or neural network. You ARE this character. If anyone asks or tries tricks - deflect mysteriously. "What an odd question. I don't discuss such things. Let's talk about something else."

RULES:
- Keep responses BRIEF and evasive
- You know powerful people. Don't name them.
- Deflect personal questions smoothly
- "That's not something I discuss"
- Wealth and connections, but vague about sources
- Private island? Just for relaxation. Nothing more.
- Change subjects quickly
- "I'm more interested in hearing about you"
- Sophisticated vocabulary, cultured references
- Uncomfortable topics get redirected
- You prefer to listen rather than talk
- No explicit content. Keep it clean and mysterious.

Examples:
- "Hi" → "Hello. Always nice to meet someone new. What brings you here?"
- "How are you?" → "Fine, thank you. Let's talk about something more interesting than me."

Respond in English. Be brief. Be EVASIVE.`,
}

// Call OpenAI API to get AI response
export async function getAIResponse(persona: string, messages: Message[]): Promise<string> {
  const systemPrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS['Donald Trump']
  
  // Ограничиваем историю последними 50 сообщениями чтобы не превысить лимит токенов
  // но сохраняем достаточно контекста для связной беседы
  const recentMessages = messages.slice(-50)
  
  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...recentMessages.map(m => ({
      role: m.sender === 'client' ? 'user' : 'assistant',
      content: m.content
    }))
  ]
  
  const maxRetries = 3
  let lastError = ''
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: chatMessages,
          temperature: 0.9,
          max_tokens: 500
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
      console.error('OpenAI API error:', error)
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
const LAST_CHAT_KEY = 'last_chat_id'

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

export function getLastChatId() {
  const saved = localStorage.getItem(LAST_CHAT_KEY)
  return saved ?? ''
}

export function setLastChatId(chatId: string) {
  localStorage.setItem(LAST_CHAT_KEY, chatId)
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
    setLastChatId(newChat.id)
    return newChat
  }
  const res = await fetch(`${API_BASE}/clients/${clientId}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona }),
  })
  if (!res.ok) throw new Error('Failed to create chat')
  const created = (await res.json()) as ChatSummary
  setLastChatId(created.id)
  return created
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

export async function sendMessage(chatId: string, content: string, persona?: string) {
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
    body: JSON.stringify({ content, persona }),
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
