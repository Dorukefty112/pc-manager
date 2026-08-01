import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { QrCode, Smartphone, Trash2, RefreshCw } from 'lucide-react'

export default function PairingPanel() {
  const { t } = useI18n()
  const [pairing, setPairing] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(0)
  const timerRef = useRef(null)

  const loadDevices = () => {
    api('/api/pairing/devices').then(setDevices).catch(() => {})
  }

  useEffect(() => {
    loadDevices()
    return () => clearInterval(timerRef.current)
  }, [])

  const generateCode = async () => {
    setLoading(true)
    setError('')
    try {
      const d = await api('/api/pairing/qr')
      setPairing(d)
      setCountdown(d.expires_in)
      const payload = JSON.stringify({
        token: d.pairing_token,
        tailscale_ip: d.tailscale_ip,
        local_ips: d.local_ips,
        port: d.port,
        hostname: d.hostname,
        site_name: d.site_name,
      })
      setQrDataUrl(await QRCode.toDataURL(payload, { width: 220, margin: 1 }))
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(timerRef.current); return 0 }
          return c - 1
        })
      }, 1000)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const revoke = async (deviceId) => {
    if (!confirm(t('Bu cihazın yetkisini kaldırmak istediğine emin misin?'))) return
    try {
      await api(`/api/pairing/devices/${deviceId}`, { method: 'DELETE' })
      loadDevices()
    } catch (e) {
      alert(t('Hata: ') + e.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {t('Mobil uygulamayı bu PC Manager\'a bağlamak için bir eşleştirme kodu üret ve telefonundan tarat. Kod 5 dakika geçerlidir ve sadece bir kere kullanılabilir.')}
      </p>

      <button onClick={generateCode} disabled={loading} className="btn btn-primary" style={{ width: 'fit-content' }}>
        {loading ? <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <QrCode size={14} />}
        {t('Yeni Cihaz Eşleştir')}
      </button>

      {error && <div style={{ fontSize: '0.78rem', color: 'var(--red)' }}>{error}</div>}

      {pairing && countdown > 0 && (
        <div className="card" style={{ padding: 20, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {qrDataUrl && <img src={qrDataUrl} alt="Pairing QR" width={180} height={180} style={{ borderRadius: 8, background: '#fff', padding: 8 }} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
            <div><strong>{t('Kod')}:</strong> <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '1.1rem' }}>{pairing.pairing_token}</span></div>
            {pairing.tailscale_ip && <div><strong>Tailscale IP:</strong> {pairing.tailscale_ip}</div>}
            <div><strong>{t('Yerel IP')}:</strong> {pairing.local_ips?.join(', ')}</div>
            <div><strong>{t('Port')}:</strong> {pairing.port}</div>
            <div style={{ color: 'var(--text-muted)' }}>{t('Kalan süre')}: {countdown}s</div>
          </div>
        </div>
      )}

      <div>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Smartphone size={15} /> {t('Eşleştirilmiş Cihazlar')}
        </div>
        {devices.length === 0 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('Henüz eşleştirilmiş cihaz yok.')}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {devices.map(dev => (
            <div key={dev.device_id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text)' }}>{dev.device_name}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {new Date(dev.paired_at * 1000).toLocaleString()}
                </div>
              </div>
              <button onClick={() => revoke(dev.device_id)} className="btn-danger" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, fontSize: '0.75rem' }}>
                <Trash2 size={13} /> {t('Yetkiyi Kaldır')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
