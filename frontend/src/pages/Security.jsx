import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import { api, getUser, isAdmin, logout } from '../api'
import { useI18n } from '../context/I18nContext'
import { PageHeader, Section, Notice, Tabs, Field, EmptyState, fmtDate, jsonOpts } from '../components/ui'
import {
  ShieldCheck, Users, MonitorSmartphone, KeyRound, Key, Trash2, Plus,
  RefreshCw, LogOut, Copy, Smartphone,
} from 'lucide-react'

function RoleBadge({ role }) {
  const { t } = useI18n()
  return <span className={`badge ${role === 'admin' ? 'badge-purple' : 'badge-gray'}`}>{role === 'admin' ? t('Yönetici') : t('İzleyici')}</span>
}

// ─── Hesabım: şifre + 2FA ────────────────────────────────────────────────────
function AccountTab() {
  const { t } = useI18n()
  const [me, setMe] = useState(null)
  const [pw, setPw] = useState({ current: '', new: '', confirm: '' })
  const [setup, setSetup] = useState(null)
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [disablePw, setDisablePw] = useState('')
  const [msg, setMsg] = useState({ kind: '', text: '' })

  const load = useCallback(() => { api('/api/auth/me').then(setMe).catch(() => {}) }, [])
  useEffect(load, [load])

  const changePassword = async () => {
    if (pw.new !== pw.confirm) return setMsg({ kind: 'error', text: t('Yeni şifreler eşleşmiyor') })
    try {
      await api('/api/auth/password', jsonOpts('POST', { current: pw.current, new: pw.new }))
      setPw({ current: '', new: '', confirm: '' })
      setMsg({ kind: 'success', text: t('Şifre değiştirildi. Diğer oturumlar kapatıldı.') })
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  const startTotp = async () => {
    try {
      const s = await api('/api/auth/2fa/setup', { method: 'POST' })
      setSetup(s)
      setQr(await QRCode.toDataURL(s.uri, { width: 200, margin: 1 }))
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  const enableTotp = async () => {
    try {
      await api('/api/auth/2fa/enable', jsonOpts('POST', { code }))
      setSetup(null); setCode('')
      setMsg({ kind: 'success', text: t('İki adımlı doğrulama etkinleştirildi.') })
      load()
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  const disableTotp = async () => {
    try {
      await api('/api/auth/2fa/disable', jsonOpts('POST', { password: disablePw }))
      setDisablePw('')
      setMsg({ kind: 'success', text: t('İki adımlı doğrulama kapatıldı.') })
      load()
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  if (me?.kind === 'mobile') {
    return <EmptyState>{t('Mobil cihaz oturumunda hesap ayarları değiştirilemez.')}</EmptyState>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Notice kind={msg.kind} onClose={() => setMsg({})}>{msg.text}</Notice>
      <Section title={t('Hesap')} icon={Users}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.85rem' }}>
          <strong style={{ color: 'var(--text)' }}>{me?.username}</strong>
          {me && <RoleBadge role={me.role} />}
        </div>
      </Section>

      <Section title={t('Şifre Değiştir')} icon={KeyRound}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <Field label={t('Mevcut şifre')}><input type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label={t('Yeni şifre')}><input type="password" autoComplete="new-password" value={pw.new} onChange={e => setPw({ ...pw, new: e.target.value })} /></Field>
          <Field label={t('Yeni şifre (tekrar)')}><input type="password" autoComplete="new-password" value={pw.confirm} onChange={e => setPw({ ...pw, confirm: e.target.value })} /></Field>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={!pw.current || pw.new.length < 6} onClick={changePassword}>
          {t('Şifreyi Güncelle')}
        </button>
      </Section>

      <Section title={t('İki Adımlı Doğrulama (2FA)')} icon={Smartphone}>
        {me?.totp_enabled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--green)' }}>✓ {t('2FA etkin. Girişte doğrulama kodu istenir.')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="password" placeholder={t('Kapatmak için şifreniz')} value={disablePw} onChange={e => setDisablePw(e.target.value)} style={{ maxWidth: 240 }} />
              <button className="btn btn-danger" disabled={!disablePw} onClick={disableTotp}>{t('2FA Kapat')}</button>
            </div>
          </div>
        ) : setup ? (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {qr && <img src={qr} alt="2FA QR" style={{ borderRadius: 10, background: '#fff', padding: 6 }} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {t('Google Authenticator, Aegis veya benzeri bir uygulamayla QR kodu okutun, ardından üretilen 6 haneli kodu girin.')}
              </div>
              <code className="code-block" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{setup.secret}</code>
              <div style={{ display: 'flex', gap: 8 }}>
                <input inputMode="numeric" maxLength={6} placeholder="123456" value={code}
                  onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{ maxWidth: 140, letterSpacing: '0.25em', fontFamily: "'JetBrains Mono', monospace" }} />
                <button className="btn btn-primary" disabled={code.length !== 6} onClick={enableTotp}>{t('Doğrula ve Etkinleştir')}</button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('Hesabınızı bir doğrulama uygulamasıyla koruyun.')}</span>
            <button className="btn btn-primary" onClick={startTotp}>{t('2FA Kur')}</button>
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── Oturumlar + API token'ları ───────────────────────────────────────────────
function SessionsTab() {
  const { t } = useI18n()
  const [items, setItems] = useState([])
  const [all, setAll] = useState(false)
  const [msg, setMsg] = useState({})
  const [tokenForm, setTokenForm] = useState({ name: '', days: 365, role: 'viewer' })
  const [newToken, setNewToken] = useState(null)

  const load = useCallback(() => {
    api(`/api/auth/sessions${all ? '?all=true' : ''}`).then(setItems).catch(e => setMsg({ kind: 'error', text: e.message }))
  }, [all])
  useEffect(load, [load])

  const revoke = async (s) => {
    if (s.current) return logout()
    try { await api(`/api/auth/sessions/${s.jti}`, { method: 'DELETE' }); load() }
    catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  const revokeOthers = async () => {
    try {
      const r = await api('/api/auth/sessions/revoke-others', { method: 'POST' })
      setMsg({ kind: 'success', text: `${r.revoked} ${t('oturum kapatıldı')}` })
      load()
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  const createToken = async () => {
    try {
      const r = await api('/api/auth/tokens', jsonOpts('POST', { ...tokenForm, days: Number(tokenForm.days) }))
      setNewToken(r)
      setTokenForm({ name: '', days: 365, role: 'viewer' })
      load()
    } catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  const web = items.filter(s => s.kind !== 'api')
  const tokens = items.filter(s => s.kind === 'api')

  const Row = ({ s }) => (
    <tr>
      <td>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{s.kind === 'api' ? s.name : (s.user_agent || '—').slice(0, 60)}</div>
        {s.current && <span className="badge badge-green" style={{ marginTop: 4 }}>{t('Bu oturum')}</span>}
      </td>
      {all && <td>{s.username}</td>}
      <td><RoleBadge role={s.role} /></td>
      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }}>{s.ip || '—'}</td>
      <td>{fmtDate(s.last_seen)}</td>
      <td>{fmtDate(s.expires)}</td>
      <td style={{ textAlign: 'right' }}>
        <button className="btn btn-ghost btn-icon" title={t('Kapat')} onClick={() => revoke(s)}>
          {s.current ? <LogOut size={14} /> : <Trash2 size={14} />}
        </button>
      </td>
    </tr>
  )

  const head = (
    <thead><tr>
      <th>{t('Cihaz / Ad')}</th>{all && <th>{t('Kullanıcı')}</th>}<th>{t('Rol')}</th><th>IP</th>
      <th>{t('Son görülme')}</th><th>{t('Bitiş')}</th><th />
    </tr></thead>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Notice kind={msg.kind} onClose={() => setMsg({})}>{msg.text}</Notice>
      <Section title={t('Aktif Oturumlar')} icon={MonitorSmartphone} actions={<>
        {isAdmin() && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> {t('Tüm kullanıcılar')}
          </label>
        )}
        <button className="btn btn-secondary" onClick={load}><RefreshCw size={13} /></button>
        <button className="btn btn-danger" onClick={revokeOthers}>{t('Diğer oturumları kapat')}</button>
      </>}>
        <div className="table-wrap"><table>{head}<tbody>{web.map(s => <Row key={s.jti} s={s} />)}</tbody></table></div>
        {!web.length && <EmptyState>{t('Oturum yok')}</EmptyState>}
      </Section>

      <Section title={t('API Token\'ları')} icon={Key}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          {t('Prometheus, betikler veya diğer PC Manager sunucuları için uzun ömürlü erişim anahtarları. Token yalnızca oluşturulduğunda bir kez gösterilir.')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <Field label={t('Ad')}><input value={tokenForm.name} placeholder="prometheus" onChange={e => setTokenForm({ ...tokenForm, name: e.target.value })} /></Field>
          <Field label={t('Süre (gün)')}><input type="number" min={1} max={3650} value={tokenForm.days} onChange={e => setTokenForm({ ...tokenForm, days: e.target.value })} style={{ width: 100 }} /></Field>
          <Field label={t('Rol')}>
            <select value={tokenForm.role} onChange={e => setTokenForm({ ...tokenForm, role: e.target.value })}>
              <option value="viewer">{t('İzleyici')}</option>
              {isAdmin() && <option value="admin">{t('Yönetici')}</option>}
            </select>
          </Field>
          <button className="btn btn-primary" disabled={!tokenForm.name.trim()} onClick={createToken}><Plus size={14} /> {t('Oluştur')}</button>
        </div>
        {newToken && (
          <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: 'rgba(34,197,94,0.3)' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--green)', marginBottom: 6 }}>{t('Token oluşturuldu — şimdi kopyalayın, tekrar gösterilmeyecek:')}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code className="code-block" style={{ flex: 1, fontSize: '0.7rem', wordBreak: 'break-all' }}>{newToken.token}</code>
              <button className="btn btn-secondary btn-icon" onClick={() => navigator.clipboard?.writeText(newToken.token)}><Copy size={14} /></button>
            </div>
          </div>
        )}
        <div className="table-wrap"><table>{head}<tbody>{tokens.map(s => <Row key={s.jti} s={s} />)}</tbody></table></div>
        {!tokens.length && <EmptyState>{t('API token yok')}</EmptyState>}
      </Section>
    </div>
  )
}

// ─── Kullanıcı yönetimi (yalnızca yönetici) ──────────────────────────────────
function UsersTab() {
  const { t } = useI18n()
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ username: '', password: '', role: 'viewer' })
  const [msg, setMsg] = useState({})
  const me = getUser().username

  const load = useCallback(() => { api('/api/users').then(setUsers).catch(e => setMsg({ kind: 'error', text: e.message })) }, [])
  useEffect(load, [load])

  const act = async (fn, okText) => {
    try { await fn(); if (okText) setMsg({ kind: 'success', text: okText }); load() }
    catch (e) { setMsg({ kind: 'error', text: e.message }) }
  }

  const create = () => act(async () => {
    await api('/api/users', jsonOpts('POST', form))
    setForm({ username: '', password: '', role: 'viewer' })
  }, t('Kullanıcı oluşturuldu'))

  const setRole = (u, role) => act(() => api(`/api/users/${encodeURIComponent(u.username)}`, jsonOpts('PUT', { role })))
  const remove = (u) => {
    if (!confirm(`${u.username} ${t('silinsin mi?')}`)) return
    act(() => api(`/api/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' }), t('Kullanıcı silindi'))
  }
  const resetPw = (u) => {
    const pw = prompt(`${u.username} ${t('için yeni şifre (en az 6 karakter):')}`)
    if (pw) act(() => api(`/api/users/${encodeURIComponent(u.username)}`, jsonOpts('PUT', { password: pw })), t('Şifre güncellendi'))
  }
  const reset2fa = (u) => act(() => api(`/api/users/${encodeURIComponent(u.username)}/2fa/reset`, { method: 'POST' }), t('2FA sıfırlandı'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Notice kind={msg.kind} onClose={() => setMsg({})}>{msg.text}</Notice>
      <Section title={t('Yeni Kullanıcı')} icon={Plus}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label={t('Kullanıcı adı')}><input value={form.username} autoCapitalize="none" onChange={e => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label={t('Şifre')}><input type="password" autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label={t('Rol')}>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="viewer">{t('İzleyici (salt-okunur)')}</option>
              <option value="admin">{t('Yönetici (tam yetki)')}</option>
            </select>
          </Field>
          <button className="btn btn-primary" disabled={!form.username || form.password.length < 6} onClick={create}>{t('Ekle')}</button>
        </div>
      </Section>

      <Section title={t('Kullanıcılar')} icon={Users}>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('Kullanıcı')}</th><th>{t('Rol')}</th><th>2FA</th><th>{t('Oluşturulma')}</th><th /></tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.username}>
              <td style={{ fontWeight: 600, color: 'var(--text)' }}>{u.username}{u.username === me && <span className="badge badge-cyan" style={{ marginLeft: 6 }}>{t('Siz')}</span>}</td>
              <td>
                <select value={u.role} onChange={e => setRole(u, e.target.value)} disabled={u.username === me}>
                  <option value="viewer">{t('İzleyici')}</option>
                  <option value="admin">{t('Yönetici')}</option>
                </select>
              </td>
              <td>{u.totp_enabled ? <span className="badge badge-green">{t('Açık')}</span> : <span className="badge badge-gray">{t('Kapalı')}</span>}</td>
              <td>{fmtDate(u.created)}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost btn-icon" title={t('Şifre sıfırla')} onClick={() => resetPw(u)}><KeyRound size={14} /></button>
                {u.totp_enabled && <button className="btn btn-ghost btn-icon" title={t('2FA sıfırla')} onClick={() => reset2fa(u)}><Smartphone size={14} /></button>}
                {u.username !== me && <button className="btn btn-ghost btn-icon" title={t('Sil')} onClick={() => remove(u)}><Trash2 size={14} /></button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </Section>
    </div>
  )
}

export default function Security() {
  const { t } = useI18n()
  const [tab, setTab] = useState('account')
  const tabs = [
    { value: 'account', label: t('Hesabım'), icon: KeyRound },
    { value: 'sessions', label: t('Oturumlar & Token'), icon: MonitorSmartphone },
    ...(isAdmin() ? [{ value: 'users', label: t('Kullanıcılar'), icon: Users }] : []),
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className="animate-fade-in">
      <PageHeader icon={ShieldCheck} title={t('Kullanıcılar & Güvenlik')} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'account' && <AccountTab />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  )
}
