import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { Shield, ShieldOff, Plus, Trash2, RefreshCw, AlertTriangle } from 'lucide-react'

export default function Firewall() {
  const [status, setStatus] = useState(null)
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ type: 'allow', direction: 'in', port: '', protocol: 'tcp', ip: '' })

  const fetchAll = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        api('/api/firewall/status'),
        api('/api/firewall/rules'),
      ])
      setStatus(s)
      setRules(r.rules || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const toggle = async (action) => {
    try {
      const r = await api('/api/firewall/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      setMessage(r.message)
      fetchAll()
    } catch (e) { setMessage(e.message) }
  }

  const addRule = async () => {
    try {
      const r = await api('/api/firewall/rule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      setMessage(r.message)
      setShowAdd(false)
      setForm({ type: 'allow', direction: 'in', port: '', protocol: 'tcp', ip: '' })
      fetchAll()
    } catch (e) { setMessage(e.message) }
  }

  const deleteRule = async (num) => {
    try {
      const r = await api('/api/firewall/rule', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rule_num: num }) })
      setMessage(r.message)
      fetchAll()
    } catch (e) { setMessage(e.message) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Shield size={32} className="animate-pulse" style={{color: 'var(--accent)'}} />
    </div>
  )

  if (status?.status === 'inactive') {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="card p-8 text-center">
          <ShieldOff size={48} className="mx-auto mb-4" style={{color: 'var(--text-muted)'}} />
          <h2 className="text-xl font-semibold mb-2" style={{color: 'var(--text)'}}>Guvenlik Duvari Kapali</h2>
          <p className="text-sm mb-6" style={{color: 'var(--text-muted)'}}>UFW etkin degil. Guvenlik duvarini etkinlestirmek icin asagidaki butonu kullan.</p>
          <button onClick={() => toggle('enable')}
            className="btn-primary px-6 py-2.5 rounded-xl text-sm"
            style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>
            <Shield size={16} /> Guvenlik Duvarini Etkinlestir
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={24} style={{color: '#22c55e'}} />
          <h2 className="text-xl font-semibold" style={{color: 'var(--text)'}}>Guvenlik Duvari</h2>
          {status && (
            <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
              style={{background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)'}}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Aktif
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => toggle('reload')} className="btn-ghost p-2 rounded-lg" style={{color: 'var(--text-muted)'}} title="Yeniden Yukle">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => toggle('disable')} className="btn-ghost p-2 rounded-lg" style={{color: '#ef4444'}} title="Kapat">
            <ShieldOff size={16} />
          </button>
          <button onClick={() => toggle('reset')} className="btn-ghost p-2 rounded-lg" style={{color: '#f59e0b'}} title="Sifirla">
            <AlertTriangle size={16} />
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3 rounded-xl text-sm animate-fade-in"
          style={{background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)'}}>
          {message}
        </div>
      )}

      {status && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Gelen', value: status.default_incoming || 'izin ver' },
            { label: 'Giden', value: status.default_outgoing || 'izin ver' },
            { label: 'Kayit', value: status.logging || 'acik' },
            { label: 'Kural Sayisi', value: rules.length },
          ].map((s, i) => (
            <div key={i} className="card p-3 text-center">
              <div className="text-xs mb-1" style={{color: 'var(--text-muted)'}}>{s.label}</div>
              <div className="text-sm font-semibold" style={{color: 'var(--text)'}}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium" style={{color: 'var(--text-secondary)'}}>Kurallar</h3>
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>
            <Plus size={14} /> Kural Ekle
          </button>
        </div>

        {showAdd && (
          <div className="mb-4 p-4 rounded-xl animate-fade-in" style={{background: 'var(--bg-surface)'}}>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="input text-sm">
                <option value="allow">Izin Ver</option>
                <option value="deny">Reddet</option>
                <option value="reject">Geri Cevir</option>
              </select>
              <select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}
                className="input text-sm">
                <option value="in">Gelen</option>
                <option value="out">Giden</option>
              </select>
              <input value={form.port} onChange={e => setForm({ ...form, port: e.target.value })}
                placeholder="Port (ornek: 80)" className="input text-sm" />
              <select value={form.protocol} onChange={e => setForm({ ...form, protocol: e.target.value })}
                className="input text-sm">
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="">Herhangi</option>
              </select>
              <input value={form.ip} onChange={e => setForm({ ...form, ip: e.target.value })}
                placeholder="IP (opsiyonel)" className="input text-sm" />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs px-3 py-1.5 rounded-lg"
                style={{color: 'var(--text-muted)'}}>Iptal</button>
              <button onClick={addRule}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>
                <Plus size={14} /> Ekle
              </button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{color: 'var(--text-muted)'}}>
            Henuz kural eklenmemis
          </div>
        ) : (
          <div className="space-y-1">
            {rules.map((rule) => (
              <div key={rule.num}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm group"
                style={{background: 'var(--bg-surface)'}}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono" style={{color: 'var(--text-muted)'}}>#{rule.num}</span>
                  <span style={{color: 'var(--text)'}}>{rule.text.replace(/^\[\s*\d+\s*\]\s*/, '')}</span>
                </div>
                <button onClick={() => deleteRule(rule.num)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all"
                  style={{color: '#ef4444'}} title="Sil">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
