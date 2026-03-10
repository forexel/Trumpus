type EventParams = Record<string, string | number | boolean | null | undefined>

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    __TRUMPUS_GA_READY__?: boolean
  }
}

function measurementId(): string {
  const env = import.meta.env as Record<string, string | undefined>
  return (env.VITE_GA_MEASUREMENT_ID || env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '').trim()
}

export function initAnalytics() {
  const id = measurementId()
  if (!id || typeof window === 'undefined' || window.__TRUMPUS_GA_READY__) return

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', id, { send_page_view: false })
  window.__TRUMPUS_GA_READY__ = true
}

export function pageview(url: string) {
  const id = measurementId()
  if (!id || typeof window === 'undefined') return
  initAnalytics()
  window.gtag?.('event', 'page_view', {
    page_title: document.title,
    page_location: window.location.href,
    page_path: url,
  })
}

export function trackEvent(eventName: string, params: EventParams = {}) {
  const id = measurementId()
  if (!id || typeof window === 'undefined') return
  initAnalytics()
  window.gtag?.('event', eventName, params)
}
