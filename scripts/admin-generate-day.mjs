#!/usr/bin/env node

const API = process.env.API_BASE || 'https://api.trumpus.tech/api/v1'
const USERNAME = process.env.ADMIN_USERNAME || ''
const PASSWORD = process.env.ADMIN_PASSWORD || ''
const DAY = process.env.DAY || new Date().toISOString().slice(0, 10)
const VISITS = Number(process.env.VISITS || 700)
const REGS = Number(process.env.REGS || 73)
const MIN_TURNS = Number(process.env.MIN_TURNS || 2)
const MAX_TURNS = Number(process.env.MAX_TURNS || 20)

if (!USERNAME || !PASSWORD) {
  console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD env vars')
  process.exit(1)
}

async function main() {
  const loginRes = await fetch(`${API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  })
  const loginBody = await loginRes.json().catch(() => ({}))
  if (!loginRes.ok) {
    throw new Error(`admin login failed: ${loginBody.error || loginRes.status}`)
  }
  const cookie = loginRes.headers.get('set-cookie')
  if (!cookie) {
    throw new Error('admin cookie not returned')
  }

  const payload = {
    day: DAY,
    visits_target: VISITS,
    registrations_target: REGS,
    min_turns: MIN_TURNS,
    max_turns: MAX_TURNS,
  }
  const genRes = await fetch(`${API}/admin/synthetic/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(payload),
  })
  const genBody = await genRes.json().catch(() => ({}))
  if (!genRes.ok) {
    throw new Error(`generation failed: ${genBody.error || genRes.status}`)
  }

  console.log(JSON.stringify(genBody, null, 2))
}

main().catch((err) => {
  console.error(err.message || String(err))
  process.exit(1)
})

