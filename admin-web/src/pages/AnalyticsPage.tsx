import { useEffect, useMemo, useState } from 'react'
import { fetchAnalytics, AnalyticsResponse, AnalyticsSeriesPoint, generateSyntheticDay } from '../lib/api'

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

function LineChart({ points, color }: { points: AnalyticsSeriesPoint[]; color: string }) {
  if (!points.length) {
    return <div className="chart-empty">No data</div>
  }
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const width = 720
  const height = 280
  const padL = 56
  const padR = 16
  const padT = 16
  const padB = 42
  const chartW = width - padL - padR
  const chartH = height - padT - padB

  const rawMin = Math.min(...points.map((p) => p.value))
  const rawMax = Math.max(...points.map((p) => p.value))
  const minValue = Math.min(rawMin, 0)
  const maxValue = rawMax === minValue ? minValue + 1 : rawMax
  const valueRange = maxValue - minValue

  const yAt = (v: number) => padT + ((maxValue - v) / valueRange) * chartH
  const xAt = (i: number) => (points.length === 1 ? padL + chartW / 2 : padL + (i / (points.length - 1)) * chartW)

  const path = points.map((p, i) => `${xAt(i)},${yAt(p.value)}`).join(' ')

  const yTicks = [minValue, minValue + valueRange / 2, maxValue]
  const xTickCount = Math.min(6, points.length)
  const xTickIndices = Array.from({ length: xTickCount }, (_, i) =>
    Math.round((i * (points.length - 1)) / Math.max(xTickCount - 1, 1))
  )

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null
  const hoverX = hoverIdx !== null ? xAt(hoverIdx) : 0
  const hoverY = hoverIdx !== null ? yAt(points[hoverIdx].value) : 0
  const tooltipX = Math.min(Math.max(hoverX - 96, padL), width - 196)
  const tooltipY = Math.max(hoverY - 54, 8)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="line-chart">
      {yTicks.map((tick, idx) => (
        <g key={`yt-${idx}`}>
          <line x1={padL} y1={yAt(tick)} x2={width - padR} y2={yAt(tick)} className="chart-grid-line" />
          <text x={padL - 8} y={yAt(tick) + 4} textAnchor="end" className="chart-axis-label">
            {Math.round(tick)}
          </text>
        </g>
      ))}

      {xTickIndices.map((idx) => (
        <text key={`xt-${idx}`} x={xAt(idx)} y={height - 12} textAnchor="middle" className="chart-axis-label">
          {points[idx].day}
        </text>
      ))}

      <polyline fill="none" stroke={color} strokeWidth="3" points={path} />

      {points.map((p, i) => (
        <g key={`${p.day}-${i}`}>
          <circle
            cx={xAt(i)}
            cy={yAt(p.value)}
            r={3.5}
            fill={color}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
          />
          <circle
            cx={xAt(i)}
            cy={yAt(p.value)}
            r={12}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
          />
        </g>
      ))}

      {hoverPoint ? (
        <g pointerEvents="none">
          <line x1={hoverX} y1={padT} x2={hoverX} y2={height - padB} className="chart-hover-line" />
          <rect x={tooltipX} y={tooltipY} width={192} height={42} rx={8} className="chart-tooltip-bg" />
          <text x={tooltipX + 10} y={tooltipY + 17} className="chart-tooltip-title">
            {hoverPoint.day}
          </text>
          <text x={tooltipX + 10} y={tooltipY + 33} className="chart-tooltip-text">
            value: {hoverPoint.value}
          </text>
        </g>
      ) : null}
    </svg>
  )
}

function ChartCard({
  title,
  points,
  color,
}: {
  title: string
  points: AnalyticsSeriesPoint[]
  color: string
}) {
  return (
    <div className="chart-card">
      <div className="chart-title">{title}</div>
      <LineChart points={points} color={color} />
      <div className="chart-foot">
        <span>{points[0]?.day ?? '-'}</span>
        <span>{points[points.length - 1]?.day ?? '-'}</span>
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const initial = useMemo(() => defaultRange(), [])
  const [day, setDay] = useState(initial.day)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [activeTab, setActiveTab] = useState<'numbers' | 'charts'>('numbers')
  const [visitsTargetInput, setVisitsTargetInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateMsg, setGenerateMsg] = useState('')

  function parseVisitorsTarget(raw: string): number | undefined {
    const digitsOnly = raw.replace(/[^\d]/g, '')
    if (!digitsOnly) return undefined
    const parsed = Number.parseInt(digitsOnly, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined
    return parsed
  }

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

  async function runSyntheticDay() {
    setGenerating(true)
    setGenerateMsg('')
    try {
      const visitsTarget = parseVisitorsTarget(visitsTargetInput)
      const chunkLimit = 4000
      const chunks =
        visitsTarget && visitsTarget > chunkLimit
          ? Array.from({ length: Math.ceil(visitsTarget / chunkLimit) }, (_, i) =>
              i < Math.floor(visitsTarget / chunkLimit) ? chunkLimit : visitsTarget % chunkLimit || chunkLimit
            )
          : [visitsTarget]

      let totalVisits = 0
      let totalRegs = 0
      let totalChats = 0
      let totalMessages = 0

      for (const chunk of chunks) {
        const resp = await generateSyntheticDay(day, chunk)
        totalVisits += resp.visits_target
        totalRegs += resp.registrations_created
        totalChats += resp.chats_created
        totalMessages += resp.messages_created
      }

      setGenerateMsg(
        `Synthetic ${day}: visits ${formatNum(totalVisits)}, regs ${formatNum(totalRegs)}, chats ${formatNum(totalChats)}, messages ${formatNum(totalMessages)}${chunks.length > 1 ? ` (${chunks.length} iterations)` : ''}`
      )
      const updated = await fetchAnalytics(day, from, to)
      setData(updated)
    } catch (err) {
      setGenerateMsg(err instanceof Error ? err.message : 'Synthetic generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="analytics-page">
      <h1>Analytics</h1>
      <p className="muted">All date metrics are calculated in UTC day boundaries.</p>

      {loading ? <div className="card">Loading analytics...</div> : null}
      {!loading && error ? <div className="card error">{error}</div> : null}

      {!loading && !error && data ? (
        <div className="analytics-sections">
          <div className="tabs-row">
            <button
              className={activeTab === 'numbers' ? 'tab-btn active' : 'tab-btn'}
              type="button"
              onClick={() => setActiveTab('numbers')}
            >
              Numbers
            </button>
            <button
              className={activeTab === 'charts' ? 'tab-btn active' : 'tab-btn'}
              type="button"
              onClick={() => setActiveTab('charts')}
            >
              Charts
            </button>
          </div>

          <section>
            <div className="section-head">
              <h2>Day</h2>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              <input
                type="number"
                min={1}
                step={1}
                placeholder="Visitors target"
                value={visitsTargetInput}
                onChange={(e) => setVisitsTargetInput(e.target.value)}
              />
              <button className="ghost" onClick={runSyntheticDay} disabled={generating}>
                {generating ? 'Generating...' : 'Generate Synthetic Day'}
              </button>
            </div>
            {generateMsg ? <div className="muted">{generateMsg}</div> : null}
            <div className="muted">Synthetic rule: approximately 10% registrations from visitors, 1 chat per registration, 2-20 messages per chat.</div>
          </section>

          {activeTab === 'numbers' ? (
            <>
              <section>
                <div className="analytics-grid four-cols">
                  <div className="stat-card"><div className="stat-label">New registrations</div><div className="stat-value">{formatNum(data.day_metrics.new_registrations)}</div></div>
                  <div className="stat-card"><div className="stat-label">DAU (wrote message)</div><div className="stat-value">{formatNum(data.day_metrics.dau)}</div></div>
                  <div className="stat-card"><div className="stat-label">New chats</div><div className="stat-value">{formatNum(data.day_metrics.new_chats)}</div></div>
                  <div className="stat-card"><div className="stat-label">New messages total</div><div className="stat-value">{formatNum(data.day_metrics.new_messages)}</div></div>
                  <div className="stat-card"><div className="stat-label">Unique home visitors</div><div className="stat-value">{formatNum(data.day_metrics.home_visitors)}</div></div>
                </div>
              </section>

              <section>
                <h2>Totals</h2>
                <div className="analytics-grid three-cols">
                  <div className="stat-card"><div className="stat-label">Registered total</div><div className="stat-value">{formatNum(data.totals.registrations)}</div></div>
                  <div className="stat-card"><div className="stat-label">Chats total</div><div className="stat-value">{formatNum(data.totals.chats)}</div></div>
                  <div className="stat-card"><div className="stat-label">Messages total</div><div className="stat-value">{formatNum(data.totals.messages)}</div></div>
                </div>
              </section>

              <section>
                <div className="section-head period-head">
                  <h2>Period</h2>
                  <span className="period-label">from</span>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  <span className="period-label">to</span>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div className="analytics-grid four-cols">
                  <div className="stat-card"><div className="stat-label">New registrations</div><div className="stat-value">{formatNum(data.period_metrics.new_registrations)}</div></div>
                  <div className="stat-card"><div className="stat-label">Active users (wrote message)</div><div className="stat-value">{formatNum(data.period_metrics.dau)}</div></div>
                  <div className="stat-card"><div className="stat-label">New chats</div><div className="stat-value">{formatNum(data.period_metrics.new_chats)}</div></div>
                  <div className="stat-card"><div className="stat-label">New messages total</div><div className="stat-value">{formatNum(data.period_metrics.new_messages)}</div></div>
                  <div className="stat-card"><div className="stat-label">Unique home visitors</div><div className="stat-value">{formatNum(data.period_metrics.home_visitors)}</div></div>
                </div>
              </section>

              <section>
                <h2>Today vs Yesterday</h2>
                <div className="analytics-grid four-cols">
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
                  <div className="stat-card">
                    <div className="stat-label">Unique home visitors</div>
                    <div className="stat-value">{formatNum(data.today.home_visitors.value)}</div>
                    <div className="stat-meta"><Delta value={data.today.home_visitors.delta} /></div>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <section>
              <div className="section-head period-head">
                <h2>Daily Charts (selected period)</h2>
                <span className="period-label">from</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="period-label">to</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="analytics-grid charts-grid">
                <ChartCard title="Site visits" points={data.series.visits_by_day} color="#1d4ed8" />
                <ChartCard title="Registrations" points={data.series.registrations_by_day} color="#16a34a" />
                <ChartCard title="DAU" points={data.series.dau_by_day} color="#0f766e" />
                <ChartCard title="New chats" points={data.series.chats_by_day} color="#ea580c" />
              </div>
            </section>
          )}
        </div>
      ) : null}
    </div>
  )
}
