#!/usr/bin/env node
import crypto from 'node:crypto'

const API_BASE = process.env.API_BASE || 'https://api.trumpus.tech/api/v1'
const TOTAL_ACCOUNTS = Number(process.env.TOTAL_ACCOUNTS || 69)
const MAX_RETRIES = 3

const PERSONAS = [
  'Donald Trump',
  'Elon Musk',
  'Kanye West',
  'Richard Nixon',
  'Andrew Jackson',
  'Marjorie Taylor Greene',
  'Tucker Carlson',
  'Lyndon B. Johnson',
  'Mark Zuckerberg',
]

const PHRASES = [
  'Hey, checking this out right now.',
  'Can you explain this in a simpler way?',
  'I want a practical step-by-step answer.',
  'What would you do first if you were me?',
  'Give me two options and the tradeoffs.',
  'That makes sense, what are the risks?',
  'Keep it short and actionable please.',
  'I need help deciding between these paths.',
  'Can you summarize this in one paragraph?',
  'What should I avoid doing here?',
]

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randHex(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex')
}

function randomPersona() {
  return PERSONAS[randInt(0, PERSONAS.length - 1)]
}

function randomMessage(i) {
  return `${PHRASES[randInt(0, PHRASES.length - 1)]} (#${i + 1})`
}

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

async function withRetry(fn) {
  let lastErr
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 300 + i * 400))
    }
  }
  throw lastErr
}

async function createOne(index, runKey) {
  const email = `seed.${runKey}.${index + 1}.${randInt(1000, 9999)}@trumpus.tech`
  const password = `Seed!${randHex(6)}A1`
  const reg = await withRetry(() => request('/auth/register', {
    method: 'POST',
    body: { email, password },
  }))

  const token = reg.access_token
  const clientId = reg.client_id
  const persona = randomPersona()

  const chat = await withRetry(() => request(`/clients/${clientId}/chats`, {
    method: 'POST',
    token,
    body: { persona },
  }))

  const messagesCount = randInt(2, 20)
  for (let i = 0; i < messagesCount; i++) {
    await withRetry(() => request(`/chats/${chat.id}/messages`, {
      method: 'POST',
      token,
      body: { content: randomMessage(i), persona },
    }))
    await new Promise((r) => setTimeout(r, randInt(90, 220)))
  }

  return { email, clientId, chatId: chat.id, messagesCount }
}

async function main() {
  const runKey = `${Date.now()}${randInt(10, 99)}`
  const out = []
  let ok = 0
  let fail = 0
  for (let i = 0; i < TOTAL_ACCOUNTS; i++) {
    try {
      const item = await createOne(i, runKey)
      out.push(item)
      ok++
      console.log(`[ok] ${i + 1}/${TOTAL_ACCOUNTS} ${item.email} chat=${item.chatId} messages=${item.messagesCount}`)
    } catch (err) {
      fail++
      console.log(`[fail] ${i + 1}/${TOTAL_ACCOUNTS} ${String(err)}`)
    }
  }

  const totalMessages = out.reduce((acc, x) => acc + x.messagesCount, 0)
  console.log(JSON.stringify({
    api_base: API_BASE,
    requested_accounts: TOTAL_ACCOUNTS,
    created_accounts: ok,
    failed_accounts: fail,
    created_chats: out.length,
    sent_messages: totalMessages,
    run_key: runKey,
    finished_at: new Date().toISOString(),
  }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

