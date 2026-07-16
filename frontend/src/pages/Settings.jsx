import { useState, useEffect } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import Toggle from '../components/Toggle'
import { Settings, Bell, Cpu, Bug, Save, Check, Loader, AlertTriangle, Shield, Send, Mail, Webhook, Trash2, Monitor, Server, HardDrive, Wifi, ScrollText, Terminal, ExternalLink } from 'lucide-react'

function SettingRow({ label, desc, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        {desc && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  )
}

function Section({ title, icon: Icon, iconColor = 'var(--accent)', children, desc }) {
  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: desc ? 8 : 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${iconColor}18`, border: `1px solid ${iconColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={iconColor} />
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)' }}>{title}</span>
      </div>
      {desc && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>{desc}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useI18n()
  const TABS = [
    { id: 'general',       label: t('Genel'),       icon: Settings },
    { id: 'notifications', label: t('Bildirimler'), icon: Bell },
    { id: 'ollama',        label: 'Ollama',          icon: Cpu },
    { id: 'emergency',     label: t('Acil Durum'),  icon: AlertTriangle },
    { id: 'email',         label: t('E-posta'),      icon: Mail },
    { id: 'webhook',       label: 'Webhook',         icon: Webhook },
    { id: 'telegram',      label: 'Telegram',        icon: Send },
    { id: 'debug',         label: 'Debug',           icon: Bug },
    { id: 'windows',       label: 'Windows',         icon: Monitor },
  ]

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
    try { const d = await api('/api/ollama/emergency', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({emergency: !emergency}) }); setEmergency(d.emergency) } catch {}
  }
  const update = (section, key, value) => setConfig(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }))
  const save = async () => {
    setSaving(true)
    try {
      await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { alert(t('Kaydedilemedi: ') + e.message) }
    setSaving(false)
  }

  if (!config) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, flexDirection: 'column', gap: 12 }}>
      <div className="spinner spinner-lg" />
    </div>
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Settings size={18} color="var(--accent)" /></span>
          {t('Ayarlar')}
        </h2>
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ minWidth: 120 }}>
          {saving ? <Loader size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? t('Kaydedildi') : t('Kaydet')}
        </button>
      </div>

      {/* Tab nav */}
      <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', paddingBottom: 0, width: 'max-content', minWidth: '100%' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: 'none',
              background: 'transparent', whiteSpace: 'nowrap', transition: 'all 0.15s',
              borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              marginBottom: -1,
            }}>
              <tab.icon size={13} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* General */}
      {activeTab === 'general' && (
        <Section title={t('Genel Ayarlar')} icon={Settings}>
          <SettingRow label={t('Dil / Language')}>
            <select value={config.general?.language || 'tr'} onChange={e => update('general', 'language', e.target.value)} style={{ width: 140 }}>
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </SettingRow>
        </Section>
      )}

      {/* Notifications */}
      {activeTab === 'notifications' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Section title={t('Uyarı Eşik Değerleri')} icon={Bell}>
            {[
              { key: 'cpu_threshold', label: 'CPU Kullanım Uyarı (%)', min: 50, max: 100 },
              { key: 'memory_threshold', label: 'RAM Kullanım Uyarı (%)', min: 50, max: 100 },
              { key: 'disk_threshold', label: 'Disk Doluluk Uyarı (%)', min: 50, max: 100 },
              { key: 'earthquake_magnitude', label: 'Deprem Büyüklük Eşiği', min: 2, max: 8, step: 0.5 },
              { key: 'earthquake_distance', label: 'Deprem Mesafe Eşiği (km)', min: 10, max: 500, step: 10 },
            ].map(item => (
              <div key={item.key} style={{ padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                  <span style={{ color: 'var(--accent)', fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{config.notifications?.[item.key] ?? 90}</span>
                </div>
                <input type="range" min={item.min} max={item.max} step={item.step || 1}
                  value={config.notifications?.[item.key] ?? 90}
                  onChange={e => update('notifications', item.key, parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }} />
              </div>
            ))}
            <SettingRow label={t('Sesli Bildirim')}>
              <Toggle checked={config.notifications?.sound_enabled ?? true} onChange={() => update('notifications', 'sound_enabled', !(config.notifications?.sound_enabled ?? true))} />
            </SettingRow>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>{t('Bildirim Kanalları')}</div>
              {[
                { key: 'telegram', label: 'Telegram' },
                { key: 'email', label: t('E-posta') },
                { key: 'webhook', label: 'Webhook' },
              ].map(ch => (
                <SettingRow key={ch.key} label={ch.label}>
                  <Toggle checked={config.notifications?.channels?.[ch.key] ?? ch.key === 'telegram'}
                    onChange={() => update('notifications', 'channels', { ...(config.notifications?.channels || {}), [ch.key]: !(config.notifications?.channels?.[ch.key] ?? ch.key === 'telegram') })} />
                </SettingRow>
              ))}
            </div>
          </Section>

          {/* Alarm history */}
          <Section title={t('Alarm Geçmişi')} icon={Bell}>
            {alerts.length === 0 ? (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('Henüz alarm yok.')}</p>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <button onClick={async () => { await api('/api/notifications/history', { method: 'DELETE' }); setAlerts([]) }} className="btn btn-danger" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>
                    <Trash2 size={12} /> {t('Temizle')}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 280, overflowY: 'auto' }}>
                  {alerts.slice(0, 50).map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: '0.78rem' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.type === 'CPU' ? '#22d3ee' : a.type === 'RAM' ? '#a78bfa' : '#34d399', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: 'var(--text)', width: 40 }}>{a.type}</span>
                      <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{a.value}</span>
                      <span style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.7rem' }}>{a.time?.slice(11, 19)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>
        </div>
      )}

      {/* Ollama */}
      {activeTab === 'ollama' && (
        <Section title={t('Yapay Zeka Asistan')} icon={Cpu}>
          <SettingRow label={t('Model')}>
            <select value={config.ollama?.model || 'ssfdre38/gemma4-turbo:e4b'} onChange={e => update('ollama', 'model', e.target.value)} style={{ width: 200 }}>
              {models.length === 0 && <option value="ssfdre38/gemma4-turbo:e4b">ssfdre38/gemma4-turbo:e4b</option>}
              {models.map(m => <option key={m.name} value={m.name}>{m.name} ({m.size_gb}GB)</option>)}
            </select>
          </SettingRow>
          <SettingRow label={t('Maksimum Tool Turu')}>
            <input type="number" min={1} max={10} value={config.ollama?.max_tool_rounds ?? 5}
              onChange={e => update('ollama', 'max_tool_rounds', parseInt(e.target.value) || 1)}
              style={{ width: 80 }} />
          </SettingRow>
        </Section>
      )}

      {/* Emergency */}
      {activeTab === 'emergency' && (
        <Section title={t('Acil Durum Modu')} icon={AlertTriangle} iconColor="#ef4444"
          desc={t('Büyük bir deprem anında asistan hayatta kalma moduna geçer. KRİTİK seviye deprem algılandığında otomatik olarak aktifleşir.')}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderRadius: 12,
            background: emergency ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${emergency ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
            gap: 14, transition: 'all 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Shield size={22} color={emergency ? '#ef4444' : 'var(--text-muted)'} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: emergency ? '#ef4444' : 'var(--text)' }}>
                  {emergency ? t('Acil Durum Modu AKTİF') : t('Acil Durum Modu')}
                </div>
                <div style={{ fontSize: '0.72rem', color: emergency ? 'rgba(239,68,68,0.7)' : 'var(--text-muted)' }}>
                  {emergency ? t('Asistan hayatta kalma modunda') : t('Şu an devre dışı')}
                </div>
              </div>
            </div>
            <button onClick={toggleEmergency} className={`btn ${emergency ? 'btn-danger' : 'btn-primary'}`}>
              {emergency ? t('Devre Dışı Bırak') : t('Aktifleştir')}
            </button>
          </div>
        </Section>
      )}

      {/* Email */}
      {activeTab === 'email' && (
        <Section title={t('E-posta (SMTP)')} icon={Mail}
          desc={t('CPU/RAM/Disk eşik değerleri aşıldığında e-posta ile bildirim gönder.')}>
          <SettingRow label={t('Aktif')}><Toggle checked={config.email?.enabled} onChange={() => update('email', 'enabled', !config.email?.enabled)} /></SettingRow>
          {[
            { key: 'smtp_server', label: t('SMTP Sunucu'), placeholder: 'smtp.gmail.com' },
            { key: 'smtp_port', label: t('Port'), placeholder: '587', type: 'number' },
            { key: 'smtp_user', label: t('Kullanıcı Adı'), placeholder: 'ornek@gmail.com' },
            { key: 'smtp_password', label: t('Şifre'), placeholder: t('App şifresi'), type: 'password' },
            { key: 'from_addr', label: t('Gönderen Adres'), placeholder: 'ornek@gmail.com', type: 'email' },
            { key: 'to_addr', label: t('Alıcı Adres'), placeholder: 'ornek@gmail.com', type: 'email' },
          ].map(f => (
            <SettingRow key={f.key} label={f.label}>
              <input type={f.type || 'text'} placeholder={f.placeholder} value={config.email?.[f.key] || ''}
                onChange={e => update('email', f.key, f.type === 'number' ? parseInt(e.target.value) || 587 : e.target.value)}
                style={{ width: 220 }} />
            </SettingRow>
          ))}
          <SettingRow label="TLS">
            <Toggle checked={config.email?.use_tls ?? true} onChange={() => update('email', 'use_tls', !(config.email?.use_tls ?? true))} />
          </SettingRow>
        </Section>
      )}

      {/* Webhook */}
      {activeTab === 'webhook' && (
        <Section title="Webhook" icon={Webhook}
          desc={t("Discord, Slack, Teams gibi servislere bildirim gönder.")}>
          <SettingRow label={t('Aktif')}><Toggle checked={config.webhook?.enabled} onChange={() => update('webhook', 'enabled', !config.webhook?.enabled)} /></SettingRow>
          <SettingRow label="URL">
            <input type="url" placeholder="https://discord.com/api/webhooks/..."
              value={config.webhook?.url || ''}
              onChange={e => update('webhook', 'url', e.target.value)}
              style={{ width: 280, fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem' }} />
          </SettingRow>
        </Section>
      )}

      {/* Telegram */}
      {activeTab === 'telegram' && (
        <Section title="Telegram" icon={Send}
          desc={t("KRİTİK ve YÜKSEK seviye depremlerde telefona anında bildirim gelmesi için Telegram bot bilgilerini gir. @BotFather'dan bot oluştur.")}>
          <SettingRow label="Bot Token">
            <input type="password" placeholder="123456:ABC-DEF1234..."
              value={config.telegram?.bot_token || ''}
              onChange={e => update('telegram', 'bot_token', e.target.value)}
              style={{ width: 240, fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem' }} />
          </SettingRow>
          <SettingRow label="Chat ID">
            <input type="text" placeholder="123456789"
              value={config.telegram?.chat_id || ''}
              onChange={e => update('telegram', 'chat_id', e.target.value)}
              style={{ width: 160, fontFamily: "'JetBrains Mono',monospace" }} />
          </SettingRow>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={save} className="btn btn-primary"><Save size={14} /> {t('Kaydet')}</button>
            <button onClick={async () => { await save(); try { const r = await api('/api/telegram/test', {method:'POST'}); alert(r.message) } catch(e) { alert(t('Hata: ') + e.message) }}} className="btn btn-secondary">
              <Send size={14} /> {t('Test Mesajı Gönder')}
            </button>
          </div>
        </Section>
      )}

      {/* Debug */}
      {activeTab === 'debug' && (
        <Section title="Debug" icon={Bug}>
          <SettingRow label={t('Debug Modu')} desc={t('Acil kod ayıklama araçları ve debug agent')}>
            <Toggle checked={config.debug?.enabled} onChange={() => update('debug', 'enabled', !config.debug?.enabled)} />
          </SettingRow>
          {config.debug?.enabled && (
            <>
              <SettingRow label={t('API Çağrılarını Logla')}>
                <Toggle checked={config.debug?.log_api_calls ?? true} onChange={() => update('debug', 'log_api_calls', !(config.debug?.log_api_calls ?? true))} />
              </SettingRow>
              <a href="/debug" className="btn btn-secondary" style={{ width: 'fit-content', marginTop: 6 }}>
                <Bug size={13} /> {t('Debug Paneline Git')}
              </a>
            </>
          )}
        </Section>
      )}

      {/* Windows */}
      {activeTab === 'windows' && (
        <Section title={t('Windows Entegrasyonu')} icon={Monitor}
          desc={t('WSL üzerinden Windows sistem yönetimi. Etkinleştirildiğinde Windows servislerini, processlerini, disklerini yönetebilirsin.')}>
          <SettingRow label={t('Windows Entegrasyonu')} desc={t('Ana etkinleştirme')}>
            <Toggle checked={config.windows?.enabled || false} onChange={() => update('windows', 'enabled', !config.windows?.enabled)} />
          </SettingRow>
          {config.windows?.enabled && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>{t('Alt Özellikler')}</div>
              {[
                { key: 'services', label: t('Servis Yönetimi'), icon: Server },
                { key: 'processes', label: t('Process Listesi'), icon: Monitor },
                { key: 'disk_info', label: t('Disk Bilgisi'), icon: HardDrive },
                { key: 'network', label: t('Ağ Bilgisi'), icon: Wifi },
                { key: 'event_log', label: t('Event Log'), icon: ScrollText },
                { key: 'command_palette', label: t('Komut Çalıştırma'), icon: Terminal },
              ].map(f => (
                <SettingRow key={f.key} label={<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><f.icon size={13} color="var(--text-muted)" />{f.label}</span>}>
                  <Toggle checked={config.windows?.[f.key] || false} onChange={() => update('windows', f.key, !config.windows?.[f.key])} />
                </SettingRow>
              ))}
              <a href="/windows" className="btn btn-secondary" style={{ marginTop: 10, width: 'fit-content' }}>
                <ExternalLink size={13} /> {t('Windows Yönetim Paneline Git')}
              </a>
            </div>
          )}
        </Section>
      )}
    </div>
  )
}
