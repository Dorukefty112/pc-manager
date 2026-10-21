import { AlertCircle, CheckCircle } from 'lucide-react'

// Yeni sayfaların paylaştığı küçük yapı taşları

export function PageHeader({ icon: Icon, title, children }) {
  return (
    <div className="page-header">
      <h2 className="page-title">
        <span className="page-title-icon"><Icon size={18} color="var(--accent)" /></span>
        {title}
      </h2>
      {children && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  )
}

export function Section({ title, icon: Icon, actions, children, style }) {
  return (
    <div className="card" style={{ padding: 20, ...style }}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' }}>
            {Icon && <Icon size={15} color="var(--accent)" />}
            {title}
          </div>
          {actions && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export function Notice({ kind = 'error', children, onClose }) {
  if (!children) return null
  const ok = kind === 'success'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10,
      fontSize: '0.8rem',
      background: ok ? 'rgba(34,197,94,0.08)' : 'var(--red-glow)',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
      color: ok ? 'var(--green)' : 'var(--red)',
    }}>
      {ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
      <span style={{ flex: 1, wordBreak: 'break-word' }}>{children}</span>
      {onClose && <button className="btn-ghost" onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>}
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {tabs.map(tab => {
        const active = tab.value === value
        return (
          <button key={tab.value} onClick={() => onChange(tab.value)} style={{
            padding: '6px 14px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 600,
            cursor: 'pointer', border: '1px solid',
            background: active ? 'var(--accent-glow)' : 'var(--bg-elevated)',
            color: active ? 'var(--accent)' : 'var(--text-muted)',
            borderColor: active ? 'rgba(6,182,212,0.3)' : 'var(--border)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {tab.icon && <tab.icon size={13} />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, minWidth: 0 }}>
      {label}
      {children}
      {hint && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.7rem' }}>{hint}</span>}
    </label>
  )
}

export function EmptyState({ children }) {
  return <div className="empty-state" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{children}</div>
}

export function fmtDate(ts) {
  if (!ts) return '—'
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts)
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
}

export function fmtBytes(b) {
  if (b === null || b === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = b
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export const jsonOpts = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})
