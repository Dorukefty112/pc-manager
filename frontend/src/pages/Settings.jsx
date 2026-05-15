import { useState, useEffect } from 'react'
import { api } from '../api'
import { Settings, Bell, Cpu, Bug, Save, Check, Loader, AlertTriangle, Shield, Send, Mail, Webhook, History, Trash2 } from 'lucide-react'

const TABS = [
  { id: 'general', label: 'Genel', icon: Settings },
  { id: 'notifications', label: 'Bildirimler', icon: Bell },
  { id: 'ollama', label: 'Ollama', icon: Cpu },
  { id: 'emergency', label: 'Acil Durum', icon: AlertTriangle },
  { id: 'email', label: 'E-posta', icon: Mail },
  { id: 'webhook', label: 'Webhook', icon: Webhook },
  { id: 'telegram', label: 'Telegram', icon: Send },
  { id: 'debug', label: 'Debug', icon: Bug },
]

export default function SettingsPage() {
  const [config, setConfig] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const [models, setModels] = useState([])
  const [emergency, setEmergency] = useState(false)
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    api('/api/settings').then(setConfig).catch(() => {})
    api('/api/ollama/models').then(d => setModels(Array.isArray(d) ? d : [])).catch(() => {})
    api('/api/ollama/emergency').then(d => setEmergency(d.emergency)).catch(() => {})
    api('/api/notifications/history').then(setAlerts).catch(() => {})
  }, [])

  const toggleEmergency = async () => {
    try {
      const d = await api('/api/ollama/emergency', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({emergency: !emergency}),
      })
      setEmergency(d.emergency)
    } catch {}
  }

  const update = (section, key, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await api('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      alert('Kaydedilemedi: ' + e.message)
    }
    setSaving(false)
  }

  if (!config) return <div className="text-center py-12 text-gray-500">Yukleniyor...</div>

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Settings size={20} className="text-cyan-400" />
        <h2 className="text-xl font-semibold">Ayarlar</h2>
      </div>

      <div className="flex gap-1 mb-2 border-b border-gray-800 pb-2 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-gray-800 text-cyan-300 border-b-2 border-cyan-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}>
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex justify-end mb-4">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 rounded-lg text-sm transition-colors min-w-[120px] justify-center">
          {saving ? <Loader size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? 'Kaydedildi' : 'Kaydet'}
        </button>
      </div>

      {activeTab === 'general' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Genel Ayarlar</h3>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Dil / Language</label>
            <select value={config.general?.language || 'tr'}
              onChange={e => update('general', 'language', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
              <option value="tr">Turkce</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Uyari Esik Degerleri</h3>
          {[
            { key: 'cpu_threshold', label: 'CPU Kullanim Uyari (%)', min: 50, max: 100 },
            { key: 'memory_threshold', label: 'RAM Kullanim Uyari (%)', min: 50, max: 100 },
            { key: 'disk_threshold', label: 'Disk Doluluk Uyari (%)', min: 50, max: 100 },
            { key: 'earthquake_magnitude', label: 'Deprem Buyukluk Esigi', min: 2, max: 8, step: 0.5 },
            { key: 'earthquake_distance', label: 'Deprem Mesafe Esigi (km)', min: 10, max: 500, step: 10 },
          ].map(item => (
            <div key={item.key}>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-400">{item.label}</label>
                <span className="text-cyan-300 font-mono">{config.notifications?.[item.key] ?? 90}</span>
              </div>
              <input type="range" min={item.min} max={item.max} step={item.step || 1}
                value={config.notifications?.[item.key] ?? 90}
                onChange={e => update('notifications', item.key, parseFloat(e.target.value))}
                className="w-full accent-cyan-500" />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2">
            <input type="checkbox" id="sound_enabled" checked={config.notifications?.sound_enabled ?? true}
              onChange={e => update('notifications', 'sound_enabled', e.target.checked)}
              className="accent-cyan-500" />
            <label htmlFor="sound_enabled" className="text-sm text-gray-400">Sesli Bildirim</label>
          </div>

          <div className="pt-3 border-t border-gray-800">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Bildirim Kanallari</h4>
            <div className="space-y-2">
              {[
                { key: 'telegram', label: 'Telegram' },
                { key: 'email', label: 'E-posta' },
                { key: 'webhook', label: 'Webhook' },
              ].map(ch => (
                <div key={ch.key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">{ch.label}</span>
                  <button onClick={() => update('notifications', 'channels', {
                    ...(config.notifications?.channels || {}),
                    [ch.key]: !(config.notifications?.channels?.[ch.key] ?? ch.key === 'telegram'),
                  })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      (config.notifications?.channels?.[ch.key] ?? ch.key === 'telegram') ? 'bg-cyan-600' : 'bg-gray-700'
                    }`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      (config.notifications?.channels?.[ch.key] ?? ch.key === 'telegram') ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-gray-800">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Alarm Gecmisi</span>
              {alerts.length > 0 && (
                <button onClick={async () => {
                  await api('/api/notifications/history', { method: 'DELETE' })
                  setAlerts([])
                }} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
                  <Trash2 size={12} /> Temizle
                </button>
              )}
            </h4>
            {alerts.length === 0 && (
              <p className="text-xs text-gray-600">Henuz alarm yok. Esik degerleri asildiginda burada gorunecek.</p>
            )}
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {alerts.slice(0, 50).map((a, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-2 text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    a.type === 'CPU' ? 'bg-cyan-400' :
                    a.type === 'RAM' ? 'bg-violet-400' : 'bg-emerald-400'
                  }`} />
                  <span className="text-gray-300 font-medium shrink-0">{a.type}</span>
                  <span className="text-gray-400">{a.value}</span>
                  <span className="text-gray-600 ml-auto">{a.time?.slice(11, 19)}</span>
                  <span className="text-gray-600 text-[10px]">{a.sent_to?.join(', ')}</span>
                </div>
              ))}
            </div>
            {alerts.length > 50 && (
              <p className="text-xs text-gray-600 mt-1">+{alerts.length - 50} daha eski kayit</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'ollama' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Yapay Zeka Asistan</h3>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Model</label>
            <select value={config.ollama?.model || 'gemma4:e4b'}
              onChange={e => update('ollama', 'model', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
              {models.length === 0 && <option value="gemma4:e4b">gemma4:e4b</option>}
              {models.map(m => <option key={m.name} value={m.name}>{m.name} ({m.size_gb}GB)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Maksimum Tool Turu</label>
            <input type="number" min={1} max={10}
              value={config.ollama?.max_tool_rounds ?? 5}
              onChange={e => update('ollama', 'max_tool_rounds', parseInt(e.target.value) || 1)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      )}

      {activeTab === 'emergency' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <AlertTriangle size={18} />
              <h3 className="text-sm font-medium uppercase tracking-wider">Acil Durum Modu</h3>
            </div>
            <p className="text-xs text-gray-500">
              Buyuk bir deprem aninda asistan hayatta kalma moduna gecer. KRITIK seviye deprem algilandiginda
              otomatik olarak aktiflesir. Bu modda asistan sadece kritik bilgi verir: ilk yardim, enkaz,
              su/yiyecek yonetimi, guvenli toplanma alanlari, iletisim.
            </p>
            <div className="flex flex-col items-center gap-3 pt-2">
              <div className={`flex items-center justify-center gap-3 w-full py-3 px-4 rounded-xl border-2 transition-all ${
                emergency
                  ? 'bg-red-900/20 border-red-600 shadow-lg shadow-red-600/20'
                  : 'bg-gray-800/50 border-gray-700'
              }`}>
                <Shield size={24} className={emergency ? 'text-red-400' : 'text-gray-500'} />
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${emergency ? 'text-red-300' : 'text-gray-300'}`}>
                    {emergency ? 'Acil Durum Modu AKTIF' : 'Acil Durum Modu'}
                  </p>
                  <p className={`text-xs ${emergency ? 'text-red-400/70' : 'text-gray-500'}`}>
                    {emergency ? 'Asistan hayatta kalma modunda' : 'Su an devre disi'}
                  </p>
                </div>
                <button onClick={toggleEmergency}
                  className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${
                    emergency
                      ? 'bg-red-700 hover:bg-red-600 text-white'
                      : 'bg-cyan-700 hover:bg-cyan-600 text-white'
                  }`}>
                  {emergency ? 'Devre Disi Birak' : 'Aktiflestir'}
                </button>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-800">
              <p className="text-xs text-gray-400 leading-relaxed">
                <strong className="text-gray-300">Otomatik aktivasyon:</strong> KRITIK risk seviyesindeki bir deprem
                (&ge;5.0, 200km icin) algilandiginda Acil Durum Modu otomatik olarak devreye girer.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'email' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Mail size={14} className="text-cyan-400" />
              E-posta (SMTP)
            </h3>
            <p className="text-xs text-gray-500">
              CPU/RAM/Disk esik degerleri asildiginda e-posta ile bildirim gonder.
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Aktif</span>
              <button onClick={() => update('email', 'enabled', !config.email?.enabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${config.email?.enabled ? 'bg-cyan-600' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${config.email?.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">SMTP Sunucu</label>
              <input type="text" placeholder="smtp.gmail.com"
                value={config.email?.smtp_server || ''}
                onChange={e => update('email', 'smtp_server', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Port</label>
              <input type="number" placeholder="587"
                value={config.email?.smtp_port ?? 587}
                onChange={e => update('email', 'smtp_port', parseInt(e.target.value) || 587)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="use_tls" checked={config.email?.use_tls ?? true}
                onChange={e => update('email', 'use_tls', e.target.checked)}
                className="accent-cyan-500" />
              <label htmlFor="use_tls" className="text-sm text-gray-400">TLS Kullan</label>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Kullanici Adi</label>
              <input type="text" placeholder="ornek@gmail.com"
                value={config.email?.smtp_user || ''}
                onChange={e => update('email', 'smtp_user', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Sifre</label>
              <input type="password" placeholder="App sifresi"
                value={config.email?.smtp_password || ''}
                onChange={e => update('email', 'smtp_password', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Gonderen Adres</label>
              <input type="email" placeholder="ornek@gmail.com"
                value={config.email?.from_addr || ''}
                onChange={e => update('email', 'from_addr', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Alici Adres</label>
              <input type="email" placeholder="ornek@gmail.com"
                value={config.email?.to_addr || ''}
                onChange={e => update('email', 'to_addr', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'webhook' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Webhook size={14} className="text-cyan-400" />
              Webhook
            </h3>
            <p className="text-xs text-gray-500">
              Discord, Slack, Teams gibi servislere bildirim gonder. Webhook URL'sini ilgili servisten al.
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Aktif</span>
              <button onClick={() => update('webhook', 'enabled', !config.webhook?.enabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${config.webhook?.enabled ? 'bg-cyan-600' : 'bg-gray-700'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${config.webhook?.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Webhook URL</label>
              <input type="url" placeholder="https://discord.com/api/webhooks/..."
                value={config.webhook?.url || ''}
                onChange={e => update('webhook', 'url', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'telegram' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Send size={14} className="text-cyan-400" />
              Telegram Bildirimleri
            </h3>
            <p className="text-xs text-gray-500">
              KRITIK ve YUKSEK seviye depremlerde telefona aninda bildirim gelmesi icin
              Telegram bot bilgilerini gir. Bot'u <code className="text-cyan-300">@BotFather</code>'dan olustur,
              mesaj at, sonra <code className="text-cyan-300">/getUpdates</code> ile Chat ID'ni bul.
            </p>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Bot Token</label>
              <input type="password" placeholder="123456:ABC-DEF1234..."
                value={config.telegram?.bot_token || ''}
                onChange={e => update('telegram', 'bot_token', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Chat ID</label>
              <input type="text" placeholder="123456789"
                value={config.telegram?.chat_id || ''}
                onChange={e => update('telegram', 'chat_id', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={save}
                className="flex items-center gap-1.5 px-4 py-2 bg-cyan-700 hover:bg-cyan-600 rounded-lg text-sm transition-colors">
                {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                Kaydet
              </button>
              <button onClick={async () => {
                await save()
                try {
                  const r = await api('/api/telegram/test', {method: 'POST'})
                  alert(r.message)
                } catch(e) { alert('Hata: ' + e.message) }
              }}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">
                <Send size={14} />
                Test Mesaji Gonder
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'debug' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Debug Modu</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-300">Debug Modu</p>
                <p className="text-xs text-gray-500">Acil kodu ayiklama araclari ve debug agent</p>
              </div>
              <button onClick={() => update('debug', 'enabled', !config.debug?.enabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.debug?.enabled ? 'bg-cyan-600' : 'bg-gray-700'
                }`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  config.debug?.enabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            {config.debug?.enabled && (
              <>
                <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                  <span className="text-sm text-gray-400">API Cagrilarini Logla</span>
                  <input type="checkbox" checked={config.debug?.log_api_calls ?? true}
                    onChange={e => update('debug', 'log_api_calls', e.target.checked)}
                    className="accent-cyan-500" />
                </div>
                <div className="pt-2">
                  <a href="/debug"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-cyan-300 transition-colors">
                    <Bug size={14} />
                    Debug Paneline Git
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
