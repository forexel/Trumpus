#!/usr/bin/env node
import crypto from 'node:crypto'

function parseArgs(argv) {
  const out = {
    url: 'https://trumpus.tech/',
    count: 724,
    concurrency: 12,
    timeoutMs: 12000,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--url' && argv[i + 1]) out.url = argv[++i]
    else if (a === '--count' && argv[i + 1]) out.count = Number(argv[++i])
    else if (a === '--concurrency' && argv[i + 1]) out.concurrency = Number(argv[++i])
    else if (a === '--timeout' && argv[i + 1]) out.timeoutMs = Number(argv[++i])
    else if (a === '--dry-run') out.dryRun = true
  }
  out.count = Number.isFinite(out.count) && out.count > 0 ? Math.floor(out.count) : 724
  out.concurrency = Number.isFinite(out.concurrency) && out.concurrency > 0 ? Math.floor(out.concurrency) : 12
  out.timeoutMs = Number.isFinite(out.timeoutMs) && out.timeoutMs > 1000 ? Math.floor(out.timeoutMs) : 12000
  return out
}

const UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
]

const REFERRERS = {
  instagram: [
    'https://www.instagram.com/',
    'https://l.instagram.com/',
  ],
  tiktok: [
    'https://www.tiktok.com/',
    'https://m.tiktok.com/',
  ],
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randHex(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex')
}

function gaCookie() {
  return `GA1.1.${randInt(100000000, 999999999)}.${Math.floor(Date.now() / 1000)}`
}

function fbpCookie() {
  return `fb.1.${Date.now()}.${randInt(100000000, 999999999)}`
}

function ttpCookie() {
  return randHex(16)
}

function sessionCookie() {
  return randHex(20)
}

function buildVisit(baseUrl) {
  const source = Math.random() < 0.5 ? 'instagram' : 'tiktok'
  const campaignSuffix = randInt(100, 999)
  const ts = Date.now()
  const u = new URL(baseUrl)
  u.searchParams.set('utm_source', source)
  u.searchParams.set('utm_medium', 'social')
  u.searchParams.set('utm_campaign', `test_${source}_${campaignSuffix}`)
  u.searchParams.set('utm_content', `ad_${randInt(1, 9)}`)
  u.searchParams.set('utm_term', `segment_${randInt(1, 30)}`)
  u.searchParams.set('ts', String(ts))
  const ua = UAS[randInt(0, UAS.length - 1)]
  const ref = REFERRERS[source][randInt(0, REFERRERS[source].length - 1)]
  const cookie = [
    `_ga=${gaCookie()}`,
    `_fbp=${fbpCookie()}`,
    `_ttp=${ttpCookie()}`,
    `sid=${sessionCookie()}`,
  ].join('; ')
  return { url: u.toString(), ua, ref, cookie, source }
}

async function oneRequest(idx, cfg) {
  const visit = buildVisit(cfg.url)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), cfg.timeoutMs)
  try {
    if (cfg.dryRun) return { ok: true, status: 0, source: visit.source, url: visit.url }
    const res = await fetch(visit.url, {
      method: 'GET',
      headers: {
        'User-Agent': visit.ua,
        Referer: visit.ref,
        Cookie: visit.cookie,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
        Connection: 'keep-alive',
      },
      signal: ctrl.signal,
    })
    return { ok: res.ok, status: res.status, source: visit.source, url: visit.url, idx }
  } catch (err) {
    return { ok: false, status: -1, error: String(err), source: visit.source, url: visit.url, idx }
  } finally {
    clearTimeout(t)
  }
}

async function run(cfg) {
  let sent = 0
  let ok = 0
  let fail = 0
  let ig = 0
  let tt = 0
  const workers = Array.from({ length: cfg.concurrency }, async () => {
    while (true) {
      const n = sent++
      if (n >= cfg.count) break
      const r = await oneRequest(n + 1, cfg)
      if (r.source === 'instagram') ig++
      else tt++
      if (r.ok) ok++
      else fail++
      if ((n + 1) % 50 === 0 || n + 1 === cfg.count) {
        console.log(`[progress] ${n + 1}/${cfg.count} ok=${ok} fail=${fail}`)
      }
      const pause = randInt(80, 350)
      await new Promise((res) => setTimeout(res, pause))
    }
  })
  await Promise.all(workers)
  console.log(JSON.stringify({
    url: cfg.url,
    total: cfg.count,
    ok,
    fail,
    sources: { instagram: ig, tiktok: tt },
    dryRun: cfg.dryRun,
    finished_at: new Date().toISOString(),
  }, null, 2))
}

const cfg = parseArgs(process.argv.slice(2))
run(cfg).catch((err) => {
  console.error(err)
  process.exit(1)
})

