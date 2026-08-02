import { useState } from 'react'
import { api, setToken, setServerBase } from '../api'
import { Monitor, QrCode, Wifi, ArrowRight, AlertCircle, Keyboard } from 'lucide-react'

function getDeviceId() {
  try {
    let id = localStorage.getItem('pcmanager_device_id')
    if (!id) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID()
      } else {
        id = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
      }
      localStorage.setItem('pcmanager_device_id', id)
    }
    return id
  } catch {
    return 'dev_' + Math.random().toString(36).substring(2, 15)
  }
}

async function getDeviceName() {
  try {
    const { Device } = await import('@capacitor/device')
    const info = await Device.getInfo()
    return info.model || info.name || 'Android Cihaz'
  } catch {
    return 'Android Cihaz'
  }
}

export default function MobilePairing() {
  const [mode, setMode] = useState('scan')
  const [scanning, setScanning] = useState(false)
  const [pairing, setPairing] = useState(false)
  const [error, setError] = useState('')
  const [manualIp, setManualIp] = useState('')
  const [manualPort, setManualPort] = useState('8081')
  const [manualCode, setManualCode] = useState('')

  const pairWithServer = async (baseUrl, token) => {
    setPairing(true)
    setError('')
    setServerBase(baseUrl)
    try {
      const device_id = getDeviceId()
      const device_name = await getDeviceName()
      const res = await api('/api/pairing/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, device_id, device_name }),
      })
      setToken(res.token)
      window.location.href = '/'
    } catch (e) {
      setServerBase('')
      setError(e.message || 'Eşleştirme başarısız oldu')
    }
    setPairing(false)
  }

  const scanQr = async () => {
    setError('')
    setScanning(true)
    try {
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
      const { camera } = await BarcodeScanner.checkPermissions()
      if (camera !== 'granted' && camera !== 'limited') {
        const req = await BarcodeScanner.requestPermissions()
        if (req.camera !== 'granted' && req.camera !== 'limited') {
          throw new Error('Kamera izni verilmedi')
        }
      }
      const { barcodes } = await BarcodeScanner.scan()
      if (!barcodes?.length) {
        setScanning(false)
        return
      }
      const payload = JSON.parse(barcodes[0].rawValue)
      const ip = payload.tailscale_ip || payload.local_ips?.[0]
      if (!ip || !payload.token || !payload.port) {
        throw new Error('QR kodu geçersiz')
      }
      await pairWithServer(`http://${ip}:${payload.port}`, payload.token)
    } catch (e) {
      setError(e.message || 'QR taranamadı')
    }
    setScanning(false)
  }

  const submitManual = async (e) => {
    e.preventDefault()
    if (!manualIp || !manualPort || !manualCode) return
    await pairWithServer(`http://${manualIp}:${manualPort}`, manualCode)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 400, padding: '32px 28px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, var(--accent-glow), rgba(167,139,250,0.12))',
            border: '1px solid rgba(6,182,212,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <Monitor size={26} color="var(--accent)" />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)' }}>PC Manager</h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Bilgisayarını eşleştirmek için Ayarlar → Mobil Cihazlar'daki QR kodu tara
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <button
            onClick={() => setMode('scan')}
            className={mode === 'scan' ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <QrCode size={14} /> Tara
          </button>
          <button
            onClick={() => setMode('manual')}
            className={mode === 'manual' ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <Keyboard size={14} /> Elle Gir
          </button>
        </div>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--red-glow)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 10, padding: '10px 14px', color: 'var(--red)',
            fontSize: '0.8rem', marginBottom: 16,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        {mode === 'scan' ? (
          <button onClick={scanQr} disabled={scanning || pairing} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '13px 20px' }}>
            {scanning || pairing
              ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              : <><QrCode size={16} /> Kodu Tara</>}
          </button>
        ) : (
          <form onSubmit={submitManual} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                <Wifi size={11} style={{ marginRight: 5, verticalAlign: 'middle' }} /> Tailscale / Yerel IP
              </label>
              <input value={manualIp} onChange={e => setManualIp(e.target.value)} placeholder="100.x.x.x" style={{ width: '100%', borderRadius: 10, padding: '10px 12px' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Port</label>
              <input value={manualPort} onChange={e => setManualPort(e.target.value)} placeholder="8081" style={{ width: '100%', borderRadius: 10, padding: '10px 12px' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Eşleştirme Kodu</label>
              <input value={manualCode} onChange={e => setManualCode(e.target.value)} placeholder="6 haneli kod" maxLength={6}
                style={{ width: '100%', borderRadius: 10, padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: '1rem', letterSpacing: 2 }} />
            </div>
            <button type="submit" disabled={pairing || !manualIp || !manualPort || !manualCode} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
              {pairing ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <>Eşleştir <ArrowRight size={16} /></>}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
