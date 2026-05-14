import { useState, useEffect } from 'react'
import { api } from '../api'
import { Settings, Bell, Cpu, Bug, Save, Check, Loader, AlertTriangle, Shield, Send } from 'lucide-react'

const TABS = [
  { id: 'general', label: 'Genel', icon: Settings },
  { id: 'notifications', label: 'Bildirimler', icon: Bell },
  { id: 'ollama', label: 'Ollama', icon: Cpu },
  { id: 'emergency', label: 'Acil Durum', icon: AlertTriangle },
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

  useEffect(() => {
    api('/api/settings').then(setConfig).catch(() => {})
    api('/api/ollama/models').then(d => setModels(Array.isArray(d) ? d : [])).catch(() => {})
    api('/api/ollama/emergency').then(d => setEmergency(d.emergency)).catch(() => {})
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

      <div className="flex gap-1 mb-4 border-b border-gray-800 pb-2 overflow-x-auto">
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
        <div className="flex-1" />
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 rounded-lg text-sm transition-colors">
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
            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-sm font-medium text-gray-200">Acil Durum Aktif</p>
                <p className="text-xs text-gray-500">Su an {emergency ? 'AKTIF' : 'devre disi'}</p>
              </div>
              <button onClick={toggleEmergency}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  emergency ? 'bg-red-600' : 'bg-gray-700'
                }`}>
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                  emergency ? 'translate-x-7' : 'translate-x-0.5'
                }`} />
              </button>
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
