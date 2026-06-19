import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Shield, ShieldOff, Plus, Trash2, RefreshCw, AlertTriangle } from 'lucide-react'

export default function Firewall() {
  const { t } = useI18n()
  const [tab, setTab] = useState('ufw')
  const [status, setStatus] = useState(null)
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ type: 'allow', direction: 'in', port: '', protocol: 'tcp', ip: '' })

  const [nativeStatus, setNativeStatus] = useState(null)
  const [nativeRules, setNativeRules] = useState([])
  const [nativeTables, setNativeTables] = useState([])
  const [nativeLoading, setNativeLoading] = useState(true)
  const [nativeMessage, setNativeMessage] = useState('')
  const [nativeForm, setNativeForm] = useState({ table: 'filter', chain: 'INPUT', action: 'accept', protocol: 'tcp', port: '', source: '' })

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

  const fetchNative = useCallback(async () => {
    try {
      const [s, r, t] = await Promise.all([
        api('/api/firewall/native/status'),
        api('/api/firewall/native/rules'),
        api('/api/firewall/native/tables'),
      ])
      setNativeStatus(s)
      setNativeRules(r.rules || [])
      setNativeTables(t.tables || [])
    } catch {}
    setNativeLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'native') fetchNative()
  }, [tab, fetchNative])

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

  const addNativeRule = async () => {
    try {
      const r = await api('/api/firewall/native/rule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nativeForm) })
      setNativeMessage(r.message)
      setNativeForm({ table: 'filter', chain: 'INPUT', action: 'accept', protocol: 'tcp', port: '', source: '' })
      fetchNative()
    } catch (e) { setNativeMessage(e.message) }
  }

  const deleteNativeRule = async (rule) => {
    try {
      const isNft = nativeStatus?.firewall === 'nftables'
      const r = await api('/api/firewall/native/rule', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        table: isNft ? rule.table?.split(' ').pop() : rule.table,
        chain: rule.chain,
        family: isNft ? rule.table?.split(' ')[0] : 'inet',
        handle: isNft ? rule.handle : 0,
        line: isNft ? 0 : rule.line,
      })})
      setNativeMessage(r.message)
      fetchNative()
    } catch (e) { setNativeMessage(e.message) }
  }

  const flushNativeChain = async (chain) => {
    try {
      const r = await api('/api/firewall/native/flush', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'filter', chain }) })
      setNativeMessage(r.message)
      fetchNative()
    } catch (e) { setNativeMessage(e.message) }
  }

  if (tab === 'native') {
    if (nativeLoading) return (
      <div className="flex items-center justify-center h-64">
        <Shield size={32} className="animate-pulse" style={{color: 'var(--accent)'}} />
      </div>
    )

    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={24} style={{color: '#22c55e'}} />
            <h2 className="text-xl font-semibold" style={{color: 'var(--text)'}}>{t('Guvenlik Duvari')}</h2>
            <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
              style={{background: nativeStatus?.firewall ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: nativeStatus?.firewall ? '#22c55e' : '#ef4444', border: `1px solid ${nativeStatus?.firewall ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`}}>
              <span className={`w-1.5 h-1.5 rounded-full ${nativeStatus?.firewall ? 'bg-green-500' : 'bg-red-500'}`} />
              {nativeStatus?.firewall || 'Yok'}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchNative} className="btn-ghost p-2 rounded-lg" style={{color: 'var(--text-muted)'}} title={t('Yenile')}>
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b pb-1" style={{borderColor: 'var(--border)'}}>
          <button onClick={() => setTab('ufw')}
            className="px-4 py-2 text-sm rounded-t-lg transition-colors"
            style={{color: 'var(--text-muted)'}}>{t('UFW')}</button>
          <button onClick={() => setTab('native')}
            className="px-4 py-2 text-sm rounded-t-lg transition-colors"
            style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>{t('Native')}</button>
        </div>

        {nativeMessage && (
          <div className="p-3 rounded-xl text-sm animate-fade-in"
            style={{background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)'}}>
            {nativeMessage}
          </div>
        )}

        {nativeStatus && (
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3 text-center">
              <div className="text-xs mb-1" style={{color: 'var(--text-muted)'}}>{t('Guvenlik Duvari')}</div>
              <div className="text-sm font-semibold" style={{color: 'var(--text)'}}>{nativeStatus.firewall || t('Yok')}</div>
            </div>
            <div className="card p-3 text-center">
              <div className="text-xs mb-1" style={{color: 'var(--text-muted)'}}>{t('Kural Sayisi')}</div>
              <div className="text-sm font-semibold" style={{color: 'var(--text)'}}>{nativeStatus.active_rules}</div>
            </div>
          </div>
        )}

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium" style={{color: 'var(--text-secondary)'}}>{t('Kurallar')}</h3>
            <div className="flex gap-2">
              <select value={nativeForm.chain} onChange={e => setNativeForm({ ...nativeForm, chain: e.target.value })}
                className="input text-xs py-1.5 px-2 rounded-lg" style={{background: 'var(--bg-surface)', color: 'var(--text)'}}>
                {nativeTables.flatMap(t => t.chains.map(c => (
                  <option key={c} value={c}>{c}</option>
                )))}
              </select>
              <button onClick={() => flushNativeChain(nativeForm.chain)}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{background: 'rgba(239,68,68,0.1)', color: '#ef4444'}}>
                {t('Temizle')}
              </button>
            </div>
          </div>

          <div className="mb-4 p-4 rounded-xl animate-fade-in" style={{background: 'var(--bg-surface)'}}>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <select value={nativeForm.table} onChange={e => setNativeForm({ ...nativeForm, table: e.target.value })}
                className="input text-sm">
                {nativeTables.map(t => (
                  <option key={t.name} value={t.table}>{t.name}</option>
                ))}
              </select>
              <select value={nativeForm.chain} onChange={e => setNativeForm({ ...nativeForm, chain: e.target.value })}
                className="input text-sm">
                {nativeTables.filter(t => t.table === nativeForm.table).flatMap(t => t.chains.map(c => (
                  <option key={c} value={c}>{c}</option>
                )))}
              </select>
              <select value={nativeForm.action} onChange={e => setNativeForm({ ...nativeForm, action: e.target.value })}
                className="input text-sm">
                <option value="accept">{t('Izin Ver')}</option>
                <option value="drop">{t('Reddet')}</option>
                <option value="reject">{t('Geri Cevir')}</option>
              </select>
              <select value={nativeForm.protocol} onChange={e => setNativeForm({ ...nativeForm, protocol: e.target.value })}
                className="input text-sm">
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="">{t('Herhangi')}</option>
              </select>
              <input value={nativeForm.port} onChange={e => setNativeForm({ ...nativeForm, port: e.target.value })}
                placeholder={t('Port')} className="input text-sm" />
              <input value={nativeForm.source} onChange={e => setNativeForm({ ...nativeForm, source: e.target.value })}
                placeholder={"IP (" + t('opsiyonel') + ")"} className="input text-sm" />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={addNativeRule}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>
                <Plus size={14} /> {t('Ekle')}
              </button>
            </div>
          </div>

          {nativeRules.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{color: 'var(--text-muted)'}}>
              {t('Henuz kural eklenmemis')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{color: 'var(--text-muted)'}}>
                    <th className="text-left px-3 py-2 font-medium">{t('Tablo')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('Zincir')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('Kural')}</th>
                    <th className="text-right px-3 py-2 font-medium">{t('Islem')}</th>
                  </tr>
                </thead>
                <tbody>
                  {nativeRules.map((rule, idx) => (
                    <tr key={idx} className="border-t" style={{borderColor: 'var(--border)'}}>
                      <td className="px-3 py-2 font-mono text-xs" style={{color: 'var(--text-muted)'}}>{rule.table}</td>
                      <td className="px-3 py-2 font-mono text-xs" style={{color: 'var(--text-muted)'}}>{rule.chain}</td>
                      <td className="px-3 py-2 text-xs" style={{color: 'var(--text)'}}>{rule.rule}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => deleteNativeRule(rule)}
                          className="p-1 rounded transition-all"
                          style={{color: '#ef4444'}} title={t('Sil')}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Shield size={32} className="animate-pulse" style={{color: 'var(--accent)'}} />
    </div>
  )

  if (status?.status === 'inactive') {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex gap-1 border-b pb-1" style={{borderColor: 'var(--border)'}}>
          <button onClick={() => setTab('ufw')}
            className="px-4 py-2 text-sm rounded-t-lg transition-colors"
            style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>{t('UFW')}</button>
          <button onClick={() => setTab('native')}
            className="px-4 py-2 text-sm rounded-t-lg transition-colors"
            style={{color: 'var(--text-muted)'}}>{t('Native')}</button>
        </div>
        <div className="card p-8 text-center">
          <ShieldOff size={48} className="mx-auto mb-4" style={{color: 'var(--text-muted)'}} />
          <h2 className="text-xl font-semibold mb-2" style={{color: 'var(--text)'}}>{t('Guvenlik Duvari Kapali')}</h2>
          <p className="text-sm mb-6" style={{color: 'var(--text-muted)'}}>{t('UFW etkin degil. Guvenlik duvarini etkinlestirmek icin asagidaki butonu kullan.')}</p>
          <button onClick={() => toggle('enable')}
            className="btn-primary px-6 py-2.5 rounded-xl text-sm"
            style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>
            <Shield size={16} /> {t('Guvenlik Duvarini Etkinlestir')}
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
          <h2 className="text-xl font-semibold" style={{color: 'var(--text)'}}>{t('Guvenlik Duvari')}</h2>
          {status && (
            <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
              style={{background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)'}}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {t('Aktif')}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => toggle('reload')} className="btn-ghost p-2 rounded-lg" style={{color: 'var(--text-muted)'}} title={t('Yeniden Yukle')}>
            <RefreshCw size={16} />
          </button>
          <button onClick={() => toggle('disable')} className="btn-ghost p-2 rounded-lg" style={{color: '#ef4444'}} title={t('Kapat')}>
            <ShieldOff size={16} />
          </button>
          <button onClick={() => toggle('reset')} className="btn-ghost p-2 rounded-lg" style={{color: '#f59e0b'}} title={t('Sifirla')}>
            <AlertTriangle size={16} />
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b pb-1" style={{borderColor: 'var(--border)'}}>
        <button onClick={() => setTab('ufw')}
          className="px-4 py-2 text-sm rounded-t-lg transition-colors"
          style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>{t('UFW')}</button>
        <button onClick={() => setTab('native')}
          className="px-4 py-2 text-sm rounded-t-lg transition-colors"
          style={{color: 'var(--text-muted)'}}>{t('Native')}</button>
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
            { label: t('Gelen'), value: status.default_incoming || t('izin ver') },
            { label: t('Giden'), value: status.default_outgoing || t('izin ver') },
            { label: t('Kayit'), value: status.logging || t('acik') },
            { label: t('Kural Sayisi'), value: rules.length },
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
          <h3 className="text-sm font-medium" style={{color: 'var(--text-secondary)'}}>{t('Kurallar')}</h3>
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>
            <Plus size={14} /> {t('Kural Ekle')}
          </button>
        </div>

        {showAdd && (
          <div className="mb-4 p-4 rounded-xl animate-fade-in" style={{background: 'var(--bg-surface)'}}>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="input text-sm">
                <option value="allow">{t('Izin Ver')}</option>
                <option value="deny">{t('Reddet')}</option>
                <option value="reject">{t('Geri Cevir')}</option>
              </select>
              <select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}
                className="input text-sm">
                <option value="in">{t('Gelen')}</option>
                <option value="out">{t('Giden')}</option>
              </select>
              <input value={form.port} onChange={e => setForm({ ...form, port: e.target.value })}
                placeholder={t('Port (ornek: 80)')} className="input text-sm" />
              <select value={form.protocol} onChange={e => setForm({ ...form, protocol: e.target.value })}
                className="input text-sm">
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="">{t('Herhangi')}</option>
              </select>
              <input value={form.ip} onChange={e => setForm({ ...form, ip: e.target.value })}
                placeholder={t('IP (opsiyonel)')} className="input text-sm" />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs px-3 py-1.5 rounded-lg"
                style={{color: 'var(--text-muted)'}}>{t('Iptal')}</button>
              <button onClick={addRule}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{background: 'var(--accent-glow)', color: 'var(--accent)'}}>
                <Plus size={14} /> {t('Ekle')}
              </button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{color: 'var(--text-muted)'}}>
            {t('Henuz kural eklenmemis')}
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
                  style={{color: '#ef4444'}} title={t('Sil')}>
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
