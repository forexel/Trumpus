const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000/api/v1'

export const PERSONA_PROMPTS: Record<string, string> = {
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

export function getPersonaPrompt(persona?: string) {
  if (!persona) return ''
  return PERSONA_PROMPTS[persona] ?? ''
}


const LAST_CHAT_KEY = 'last_chat_id'
const CHAT_SEEN_MAP_KEY = 'chat_seen_map_v1'
const CLIENT_ID_KEY = 'client_id'
const CLIENT_EMAIL_KEY = 'client_email'
const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const ACCESS_EXPIRES_KEY = 'access_expires'
const OFFLINE_CHATS_CACHE_PREFIX = 'offline_chats_v1:'
const OFFLINE_MESSAGES_CACHE_PREFIX = 'offline_messages_v1:'
const OFFLINE_CONTEXT_CACHE_PREFIX = 'offline_context_v1:'
const OFFLINE_MESSAGES_CACHE_MAX = 400
const OFFLINE_CONTEXT_MAX_ITEMS = 16
const OFFLINE_CONTEXT_SNIPPET_MAX = 220
let hardLogoutInFlight: Promise<void> | null = null

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

export type OfflineContextItem = {
  sender: 'client' | 'admin'
  content: string
  created_at: string
}

function readCachedJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeCachedJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota/storage failures and keep online flow unaffected.
  }
}

function chatsCacheKey(clientId: string) {
  return `${OFFLINE_CHATS_CACHE_PREFIX}${clientId}`
}

function messagesCacheKey(chatId: string) {
  return `${OFFLINE_MESSAGES_CACHE_PREFIX}${chatId}`
}

function contextCacheKey(chatId: string) {
  return `${OFFLINE_CONTEXT_CACHE_PREFIX}${chatId}`
}

function readCachedChats(clientId: string): ChatSummary[] {
  if (!clientId) return []
  return readCachedJSON<ChatSummary[]>(chatsCacheKey(clientId), [])
}

function writeCachedChats(clientId: string, chats: ChatSummary[]) {
  if (!clientId) return
  writeCachedJSON(chatsCacheKey(clientId), chats)
}

function readCachedMessages(chatId: string): Message[] {
  if (!chatId) return []
  return readCachedJSON<Message[]>(messagesCacheKey(chatId), [])
}

function writeCachedMessages(chatId: string, messages: Message[]) {
  if (!chatId) return
  const trimmed = messages.length > OFFLINE_MESSAGES_CACHE_MAX ? messages.slice(-OFFLINE_MESSAGES_CACHE_MAX) : messages
  writeCachedJSON(messagesCacheKey(chatId), trimmed)
  writeCachedContext(chatId, trimmed)
}

function appendCachedMessage(chatId: string, message: Message) {
  if (!chatId || !message?.id) return
  const current = readCachedMessages(chatId)
  if (current.some(m => m.id === message.id)) return
  current.push(message)
  writeCachedMessages(chatId, current)
}

function toOfflineContextItems(messages: Message[]): OfflineContextItem[] {
  const out: OfflineContextItem[] = []
  const start = Math.max(0, messages.length - OFFLINE_CONTEXT_MAX_ITEMS)
  for (let i = start; i < messages.length; i++) {
    const m = messages[i]
    if (!m || !m.content) continue
    let content = m.content.trim()
    if (!content) continue
    if (content.length > OFFLINE_CONTEXT_SNIPPET_MAX) {
      content = `${content.slice(0, OFFLINE_CONTEXT_SNIPPET_MAX).trimEnd()}...`
    }
    out.push({
      sender: m.sender,
      content,
      created_at: m.created_at,
    })
  }
  return out
}

function writeCachedContext(chatId: string, messages: Message[]) {
  if (!chatId) return
  writeCachedJSON(contextCacheKey(chatId), toOfflineContextItems(messages))
}

export function getOfflineShortContext(chatId: string): OfflineContextItem[] {
  if (!chatId) return []
  return readCachedJSON<OfflineContextItem[]>(contextCacheKey(chatId), [])
}

export function getClientId() {
  return localStorage.getItem(CLIENT_ID_KEY) ?? ''
}

export function getWsBase() {
  return API_BASE.replace(/^http/, 'ws')
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) ?? ''
}

function setAuthTokens(tokens: { access_token: string; refresh_token: string; access_expires?: string }) {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token)
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
  if (tokens.access_expires) {
    localStorage.setItem(ACCESS_EXPIRES_KEY, tokens.access_expires)
  }
}

function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(ACCESS_EXPIRES_KEY)
}

export function setClientSession(clientId: string, email: string) {
  if (clientId) localStorage.setItem(CLIENT_ID_KEY, clientId)
  if (email) localStorage.setItem(CLIENT_EMAIL_KEY, email)
}

export function clearClientSession() {
  localStorage.removeItem(CLIENT_ID_KEY)
  localStorage.removeItem(CLIENT_EMAIL_KEY)
}

function redirectToLogin() {
  const path = window.location.pathname
  const isPublicAuthPath =
    path === '/' ||
    path === '/login' ||
    path.startsWith('/forgot') ||
    path.startsWith('/register') ||
    path.startsWith('/create-account') ||
    path.startsWith('/reset') ||
    path.startsWith('/reset-password') ||
    path.startsWith('/forgot-password') ||
    path.startsWith('/auth/google/callback')
  if (isPublicAuthPath) return
  window.location.replace('/login')
}

export async function hardLogout() {
  if (hardLogoutInFlight) return hardLogoutInFlight

  hardLogoutInFlight = (async () => {
    try {
      try {
        ;(window as any).__TRUMPUS_WS__?.close?.()
      } catch {}

      try {
        localStorage.clear()
      } catch {}
      try {
        sessionStorage.clear()
      } catch {}

      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 1500)

      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          signal: controller.signal,
        })
      } catch {
        // Ignore network/auth failures: client-side cleanup and redirect are mandatory.
      } finally {
        window.clearTimeout(timeoutId)
      }

      redirectToLogin()
    } finally {
      hardLogoutInFlight = null
    }
  })()

  return hardLogoutInFlight
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken()
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: refreshToken ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'include',
    body: refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : undefined,
  })
  if (!res.ok) return false
  const data = (await res.json()) as { access_token: string; refresh_token: string; access_expires?: string }
  if (data.access_token && data.refresh_token) {
    setAuthTokens(data)
    return true
  }
  return false
}

async function fetchWithAuth(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {})
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(input, { ...init, headers, credentials: 'include' })
  if (res.status !== 401) return res

  const refreshed = await refreshAccessToken()
  if (!refreshed) {
    await hardLogout()
    throw new Error('unauthorized')
  }
  const retryHeaders = new Headers(init.headers ?? {})
  const newToken = getAccessToken()
  if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`)
  if (!retryHeaders.has('Content-Type') && init.body) {
    retryHeaders.set('Content-Type', 'application/json')
  }
  const retryRes = await fetch(input, { ...init, headers: retryHeaders, credentials: 'include' })
  if (retryRes.status === 401) {
    await hardLogout()
    throw new Error('unauthorized')
  }
  return retryRes
}

export function getLastChatId() {
  const saved = localStorage.getItem(LAST_CHAT_KEY)
  return saved ?? ''
}

export function setLastChatId(chatId: string) {
  localStorage.setItem(LAST_CHAT_KEY, chatId)
}

function readChatSeenMap(): Record<string, number> {
  return readCachedJSON<Record<string, number>>(CHAT_SEEN_MAP_KEY, {})
}

function writeChatSeenMap(next: Record<string, number>) {
  writeCachedJSON(CHAT_SEEN_MAP_KEY, next)
}

export function getChatSeenAt(chatId: string): number {
  if (!chatId) return 0
  const map = readChatSeenMap()
  const raw = map[chatId]
  return Number.isFinite(raw) ? raw : 0
}

export function markChatSeen(chatId: string, seenAt: number = Date.now()) {
  if (!chatId) return
  const map = readChatSeenMap()
  map[chatId] = Math.max(0, Math.floor(seenAt))
  writeChatSeenMap(map)
}

export async function getSession() {
  const headers = new Headers()
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let res = await fetch(`${API_BASE}/auth/session`, { headers, credentials: 'include' })
  if (res.status === 401) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      const retryHeaders = new Headers()
      const newToken = getAccessToken()
      if (newToken) retryHeaders.set('Authorization', `Bearer ${newToken}`)
      res = await fetch(`${API_BASE}/auth/session`, { headers: retryHeaders, credentials: 'include' })
    }
  }
  if (!res.ok) {
    await hardLogout()
    return null
  }
  const data = (await res.json()) as { client_id: string; email: string }
  if (!data?.client_id || !data?.email) {
    await hardLogout()
    return null
  }
  setClientSession(data.client_id, data.email)
  return data
}

export async function logout() {
  await hardLogout()
}

export async function fetchChats(clientId: string) {
  try {
    const res = await fetchWithAuth(`${API_BASE}/clients/${clientId}/chats`)
    if (!res.ok) throw new Error('Failed to load chats')
    const data = (await res.json()) as { items: ChatSummary[] }
    writeCachedChats(clientId, data.items ?? [])
    return data
  } catch (err) {
    if ((err as Error)?.message === 'unauthorized') throw err
    const cached = readCachedChats(clientId)
    if (cached.length > 0) {
      return { items: cached }
    }
    throw err
  }
}

export async function trackPageView(page: 'home') {
  const res = await fetchWithAuth(`${API_BASE}/analytics/page-view`, {
    method: 'POST',
    body: JSON.stringify({ page }),
  })
  if (!res.ok) throw new Error('Failed to track page view')
  return (await res.json()) as { ok: boolean }
}

export async function createChat(clientId: string, persona: string) {
  const res = await fetchWithAuth(`${API_BASE}/clients/${clientId}/chats`, {
    method: 'POST',
    body: JSON.stringify({ persona }),
  })
  if (!res.ok) throw new Error('Failed to create chat')
  const created = (await res.json()) as ChatSummary
  const cached = readCachedChats(clientId)
  writeCachedChats(clientId, [created, ...cached.filter(item => item.id !== created.id)])
  setLastChatId(created.id)
  return created
}

export async function fetchMessages(chatId: string) {
  try {
    const res = await fetchWithAuth(`${API_BASE}/chats/${chatId}/messages`)
    if (!res.ok) throw new Error('Failed to load messages')
    const data = (await res.json()) as { items: Message[] }
    writeCachedMessages(chatId, data.items ?? [])
    return data
  } catch (err) {
    if ((err as Error)?.message === 'unauthorized') throw err
    const cached = readCachedMessages(chatId)
    if (cached.length > 0) {
      writeCachedContext(chatId, cached)
      return { items: cached }
    }
    throw err
  }
}

export function deleteChat(_chatId: string): void {
  // Not implemented on the server yet.
}

export async function sendMessage(chatId: string, content: string, persona?: string) {
  const personaPrompt = getPersonaPrompt(persona)
  const res = await fetchWithAuth(`${API_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, persona, persona_prompt: personaPrompt || undefined }),
  })
  if (!res.ok) throw new Error('Failed to send message')
  const msg = (await res.json()) as Message
  appendCachedMessage(chatId, msg)
  return msg
}

// Update chat title
export function updateChatTitle(_chatId: string, _title: string): void {
  // Not implemented on the server yet.
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(await parseAuthError(res, 'Invalid email or password'))
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; email: string; client_id: string; access_expires?: string }
  if (data.access_token && data.refresh_token) {
    setAuthTokens(data)
  }
  setClientSession(data.client_id, data.email)
  return data
}

export async function register(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(await parseAuthError(res, 'Registration failed'))
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; email: string; client_id: string; access_expires?: string }
  if (data.access_token && data.refresh_token) {
    setAuthTokens(data)
  }
  setClientSession(data.client_id, data.email)
  return data
}

async function parseAuthError(res: Response, fallback: string) {
  if (res.status === 429) return 'Too many requests. Try again later.'
  let raw = ''
  try {
    const data = (await res.json()) as { error?: string }
    raw = data?.error ?? ''
  } catch {
    return fallback
  }
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'invalid email') return 'Invalid email address.'
  if (normalized.startsWith('password length')) return 'Password must be 6-128 characters.'
  if (normalized === 'invalid credentials') return 'Email or password is incorrect.'
  if (normalized === 'user already exists') return 'An account with this email already exists.'
  if (normalized === 'invalid json') return 'Invalid request. Please try again.'
  if (normalized !== '') return raw
  return fallback
}

export async function forgotPassword(email: string) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error('Failed to send email')
  return (await res.json()) as { sent: boolean }
}

export async function resetPassword(token: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, new_password: newPassword }),
  })
  if (!res.ok) throw new Error('Failed to reset password')
  const data = (await res.json()) as { access_token: string; refresh_token: string; email: string; client_id: string; access_expires?: string }
  if (data.access_token && data.refresh_token) {
    setAuthTokens(data)
  }
  setClientSession(data.client_id, data.email)
  return data
}

export async function resetPasswordWithOld(email: string, oldPassword: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, old_password: oldPassword, new_password: newPassword }),
  })
  if (!res.ok) throw new Error('Failed to reset password')
  const data = (await res.json()) as { access_token: string; refresh_token: string; email: string; client_id: string; access_expires?: string }
  if (data.access_token && data.refresh_token) {
    setAuthTokens(data)
  }
  setClientSession(data.client_id, data.email)
  return data
}
