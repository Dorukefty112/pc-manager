import { useState, useEffect, useCallback } from 'react'
import { api, isAdmin } from '../api'
import { useI18n } from '../context/I18nContext'
import { Section, Notice, Field, EmptyState, jsonOpts } from './ui'
import { Radio, Plus, Trash2, Zap } from 'lucide-react'

// Ağdaki diğer cihazları Wake-on-LAN sihirli paketiyle uyandırma
export default function WolPanel() {
  const { t } = useI18n()
  const admin = isAdmin()
  const [devices, setDevices] = useState([])
  const [form, setForm] = useState({ name: '', mac: '', broadcast: '255.255.255.255', port: 9 })
  const [msg, setMsg] = useState({})

  const load = useCallback(() => { api('/api/power/wol/devices').then(setDevices).catch(() => {}) }, [])
  useEffect(load, [load])

  const add = async () => {
    try {
      await api('/api/power/wol/devices', jsonOpts('POST', { ...form, port: Number(form.port) }))
      setForm({ name: '', mac: '', broadcast: '255.255.255.255', port: 9 }); load()
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }
  const wake = async (d) => {
    try { setMsg({ kind: 'success', text: (await api(`/api/power/wol/devices/${d.id}/wake`, { method: 'POST' })).message }) }
    catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }
  const remove = async (d) => {
    if (!confirm(`${d.name} ${t('silinsin mi?')}`)) return
    await api(`/api/power/wol/devices/${d.id}`, { method: 'DELETE' }).catch(() => {})
    load()
  }

  return (
    <Section title={t('Wake-on-LAN')} icon={Radio}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {t('Aynı yerel ağdaki bilgisayarları uzaktan açın. Hedef cihazın BIOS/UEFI ve ağ kartı ayarlarında WOL etkin olmalıdır.')}
        </div>
        <Notice kind={msg.kind} onClose={() => setMsg({})}>{msg.text}</Notice>
        {devices.length === 0 ? <EmptyState>{t('Kayıtlı cihaz yok')}</EmptyState> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {devices.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.85rem' }}>{d.name}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', color: 'var(--text-muted)' }}>{d.mac} → {d.broadcast}:{d.port}</div>
                </div>
                {admin && <>
                  <button className="btn btn-success" onClick={() => wake(d)}><Zap size={13} /> {t('Uyandır')}</button>
                  <button className="btn btn-ghost btn-icon" onClick={() => remove(d)}><Trash2 size={14} /></button>
                </>}
              </div>
            ))}
          </div>
        )}
        {admin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label={t('Ad')}><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('Masaüstü PC')} /></Field>
            <Field label="MAC"><input value={form.mac} onChange={e => setForm({ ...form, mac: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" style={{ fontFamily: "'JetBrains Mono', monospace" }} /></Field>
            <Field label={t('Yayın adresi')}><input value={form.broadcast} onChange={e => setForm({ ...form, broadcast: e.target.value })} style={{ width: 150 }} /></Field>
            <Field label="Port"><input type="number" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} style={{ width: 80 }} /></Field>
            <button className="btn btn-primary" disabled={!form.name || !form.mac} onClick={add}><Plus size={14} /> {t('Ekle')}</button>
          </div>
        )}
      </div>
    </Section>
  )
}
