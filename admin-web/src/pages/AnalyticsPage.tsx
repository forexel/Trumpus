import { useEffect, useMemo, useState } from 'react'
import { fetchAnalytics, AnalyticsResponse } from '../lib/api'

function toISODateUTC(d: Date) {
  return d.toISOString().slice(0, 10)
}

function defaultRange() {
  const now = new Date()
  const to = toISODateUTC(now)
  const fromDate = new Date(now.getTime())
  fromDate.setUTCDate(fromDate.getUTCDate() - 6)
  const from = toISODateUTC(fromDate)
  return { day: to, from, to }
}

function formatNum(value: number) {
  return Intl.NumberFormat('en-US').format(value)
}

function Delta({ value }: { value: number }) {
  const cls = value > 0 ? 'delta up' : value < 0 ? 'delta down' : 'delta'
  const sign = value > 0 ? '+' : ''
  return <span className={cls}>{`${sign}${value}`}</span>
}

export default function AnalyticsPage() {
  const initial = useMemo(() => defaultRange(), [])
  const [day, setDay] = useState(initial.day)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<AnalyticsResponse | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    fetchAnalytics(day, from, to)
      .then((resp) => {
        if (mounted) setData(resp)
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load analytics')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [day, from, to])

  return (
    <div className="analytics-page">
      <h1>Analytics</h1>
      <p className="muted">All date metrics are calculated in UTC day boundaries.</p>

      <div className="analytics-filters">
        <label>
          Day
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {loading ? <div className="card">Loading analytics...</div> : null}
      {!loading && error ? <div className="card error">{error}</div> : null}

      {!loading && !error && data ? (
        <div className="analytics-sections">
          <section>
            <h2>Selected Day ({data.day})</h2>
            <div className="analytics-grid">
              <div className="stat-card"><div className="stat-label">New registrations</div><div className="stat-value">{formatNum(data.day_metrics.new_registrations)}</div></div>
              <div className="stat-card"><div className="stat-label">DAU (wrote message)</div><div className="stat-value">{formatNum(data.day_metrics.dau)}</div></div>
              <div className="stat-card"><div className="stat-label">New chats</div><div className="stat-value">{formatNum(data.day_metrics.new_chats)}</div></div>
              <div className="stat-card"><div className="stat-label">New messages total</div><div className="stat-value">{formatNum(data.day_metrics.new_messages)}</div></div>
            </div>
          </section>

          <section>
            <h2>Totals</h2>
            <div className="analytics-grid">
              <div className="stat-card"><div className="stat-label">Registered total</div><div className="stat-value">{formatNum(data.totals.registrations)}</div></div>
              <div className="stat-card"><div className="stat-label">Chats total</div><div className="stat-value">{formatNum(data.totals.chats)}</div></div>
              <div className="stat-card"><div className="stat-label">Messages total</div><div className="stat-value">{formatNum(data.totals.messages)}</div></div>
            </div>
          </section>

          <section>
            <h2>Selected Period ({data.period.from} to {data.period.to})</h2>
            <div className="analytics-grid">
              <div className="stat-card"><div className="stat-label">New registrations</div><div className="stat-value">{formatNum(data.period_metrics.new_registrations)}</div></div>
              <div className="stat-card"><div className="stat-label">Active users (wrote message)</div><div className="stat-value">{formatNum(data.period_metrics.dau)}</div></div>
              <div className="stat-card"><div className="stat-label">New chats</div><div className="stat-value">{formatNum(data.period_metrics.new_chats)}</div></div>
              <div className="stat-card"><div className="stat-label">New messages total</div><div className="stat-value">{formatNum(data.period_metrics.new_messages)}</div></div>
            </div>
          </section>

          <section>
            <h2>Today vs Yesterday</h2>
            <div className="analytics-grid">
              <div className="stat-card">
                <div className="stat-label">New registrations</div>
                <div className="stat-value">{formatNum(data.today.new_registrations.value)}</div>
                <div className="stat-meta"><Delta value={data.today.new_registrations.delta} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Created chats</div>
                <div className="stat-value">{formatNum(data.today.new_chats.value)}</div>
                <div className="stat-meta"><Delta value={data.today.new_chats.delta} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total messages</div>
                <div className="stat-value">{formatNum(data.today.new_messages.value)}</div>
                <div className="stat-meta"><Delta value={data.today.new_messages.delta} /></div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
