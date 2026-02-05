const stats = [
  { label: 'New registrations', value: '—' },
  { label: 'Total registrations', value: '—' },
  { label: 'DAU', value: '—' },
  { label: 'MAU', value: '—' },
  { label: 'New clients today', value: '—' },
  { label: 'Churn today', value: '—' },
  { label: 'Total chats', value: '—' },
  { label: 'New chats', value: '—' },
  { label: 'Total messages', value: '—' },
  { label: 'New messages', value: '—' },
]

export default function AnalyticsPage() {
  return (
    <div className="analytics-page">
      <h1>Analytics</h1>
      <p className="muted">MVP placeholders. Data wiring comes next.</p>
      <div className="analytics-grid">
        {stats.map((item) => (
          <div key={item.label} className="stat-card">
            <div className="stat-label">{item.label}</div>
            <div className="stat-value">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
