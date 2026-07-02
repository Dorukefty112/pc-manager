import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Clock, AlertTriangle, Activity, Crosshair, Bell, BellOff, RefreshCw } from 'lucide-react'

const RISK_RENK_HARITA = {
  KRITIK: '#ef4444', YUKSEK: '#f97316', ORTA: '#eab308',
  DIKKAT: '#06b6d4', BILGI: '#6b7280', BILINMIYOR: '#6b7280',
}
const RISK_BADGE = {
  KRITIK: 'badge-red', YUKSEK: 'badge-yellow', ORTA: 'badge-yellow',
  DIKKAT: 'badge-cyan', BILGI: 'badge-gray', BILINMIYOR: 'badge-gray',
}
const RISK_SIRALAMA = { KRITIK: 0, YUKSEK: 1, ORTA: 2, DIKKAT: 3, BILGI: 4, BILINMIYOR: 5 }

function DepremMarker({ d, secili, setSecili }) {
  const { t } = useI18n()
  const renk = RISK_RENK_HARITA[d.risk_seviyesi] || '#6b7280'
  const yaricap = Math.max(4, Math.min(20, (d.magnitude || 1) * 4))
  return (
    <CircleMarker
      center={[d.enlem, d.boylam]} radius={yaricap}
      pathOptions={{ color: renk, fillColor: renk, fillOpacity: secili === d ? 0.8 : 0.3, weight: secili === d ? 3 : 1.5 }}
      eventHandlers={{ click: () => setSecili(d) }}
    >
      <Popup>
        <div style={{ minWidth: 180, fontSize: '0.8rem' }}>
          <div style={{ fontWeight: 700, color: renk, marginBottom: 4 }}>
            M{d.magnitude > 0 ? d.magnitude.toFixed(1) : '-.-'} — {d.risk_seviyesi}
          </div>
          <div style={{ color: '#374151', marginBottom: 2 }}>{d.yer}</div>
          <div style={{ color: '#6b7280' }}>{d.tarih} {d.saat}</div>
          <div style={{ color: '#6b7280' }}>{d.derinlik} {t('km derinlik')}</div>
          {d.istanbula_uzaklik !== undefined && <div style={{ color: '#6b7280' }}>{d.istanbula_uzaklik} km İstanbul</div>}
        </div>
      </Popup>
    </CircleMarker>
  )
}

export default function DepremUyari() {
  const { t } = useI18n()
  const [depremler, setDepremler] = useState([])
  const [secili, setSecili] = useState(null)
  const [bildirim, setBildirim] = useState(true)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState(null)
  const [filtre, setFiltre] = useState('tum')
  const oncekiAnahtarlar = useRef(new Set())

  const fetchData = async () => {
    try {
      const data = await api('/api/deprem/son')
      if (!Array.isArray(data)) throw new Error(t('Geçersiz veri'))
      const sirali = data.sort((a, b) => {
        const rA = RISK_SIRALAMA[a.risk_seviyesi] || 5, rB = RISK_SIRALAMA[b.risk_seviyesi] || 5
        if (rA !== rB) return rA - rB
        return `${b.tarih} ${b.saat}`.localeCompare(`${a.tarih} ${a.saat}`)
      })
      setDepremler(sirali); setHata(null); setYukleniyor(false)
    } catch {
      setHata(t('Deprem verileri alınamadı.')); setYukleniyor(false)
    }
  }

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 30000); return () => clearInterval(id) }, [])

  const filtreli = depremler.filter(d => {
    if (filtre === 'istanbul') return d.istanbula_uzaklik < 200
    if (filtre === 'kritik') return ['KRITIK', 'YUKSEK', 'ORTA'].includes(d.risk_seviyesi)
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon" style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)' }}>
            <Activity size={18} color="#f97316" />
          </span>
          {t('Deprem İzleme')}
          <span style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>Kandilli Rasathanesi</span>
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={filtre} onChange={e => setFiltre(e.target.value)} style={{ fontSize: '0.82rem', borderRadius: 9, padding: '6px 12px' }}>
            <option value="tum">{t('Tümü')}</option>
            <option value="istanbul">{t('İstanbul Çevresi')}</option>
            <option value="kritik">{t('Kritik Olanlar')}</option>
          </select>
          <button onClick={() => setBildirim(p => !p)} className="btn-icon" style={{
            background: bildirim ? 'var(--accent-glow)' : 'var(--bg-elevated)',
            color: bildirim ? 'var(--accent)' : 'var(--text-muted)',
            borderColor: bildirim ? 'rgba(6,182,212,0.3)' : 'var(--border)',
          }}>
            {bildirim ? <Bell size={15} /> : <BellOff size={15} />}
          </button>
          <button onClick={fetchData} className="btn btn-secondary"><RefreshCw size={14} /></button>
        </div>
      </div>

      {hata && (
        <div style={{ background: 'var(--red-glow)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '12px 16px', color: 'var(--red)', fontSize: '0.85rem', display: 'flex', gap: 10, alignItems: 'center' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} /> {hata}
          <button onClick={fetchData} style={{ marginLeft: 'auto', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', fontSize: '0.82rem' }}>{t('Tekrar dene')}</button>
        </div>
      )}

      {yukleniyor ? (
        <div className="empty-state"><div className="spinner spinner-lg" />{t('Deprem verileri yükleniyor...')}</div>
      ) : (
        <>
          {/* Map */}
          <div className="card" style={{ overflow: 'hidden', height: 420 }}>
            <MapContainer center={[39.0, 35.0]} zoom={6} scrollWheelZoom={true}
              style={{ height: '100%', width: '100%', background: '#0d1829' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {filtreli.map(d => (
                <DepremMarker key={`${d.tarih}_${d.saat}_${d.enlem}_${d.boylam}`} d={d} secili={secili} setSecili={setSecili} />
              ))}
            </MapContainer>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
            {/* Earthquake list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtreli.length === 0 && <div className="empty-state">{t('Bu filtrede deprem bulunamadı.')}</div>}
              {filtreli.slice(0, 50).map((d, i) => {
                const renk = RISK_RENK_HARITA[d.risk_seviyesi] || '#6b7280'
                const isKritik = d.risk_seviyesi === 'KRITIK'
                const isSelected = secili === d
                return (
                  <div key={`${d.tarih}${d.saat}${i}`} onClick={() => setSecili(isSelected ? null : d)} style={{
                    background: isSelected ? `${renk}10` : 'var(--bg-card)',
                    border: `1px solid ${isSelected ? renk + '50' : 'var(--border)'}`,
                    borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    animation: isKritik ? 'pulse-glow 2s ease-in-out infinite' : 'none',
                  }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-light)' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <div style={{
                          padding: '4px 10px', borderRadius: 8,
                          background: `${renk}18`, border: `1px solid ${renk}35`,
                          fontSize: '0.88rem', fontWeight: 800, color: renk, flexShrink: 0,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                          <Activity size={12} /> M{d.magnitude > 0 ? d.magnitude.toFixed(1) : '-.-'}
                        </div>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.yer}
                        </span>
                      </div>
                      <span className={`badge ${RISK_BADGE[d.risk_seviyesi] || 'badge-gray'}`}>
                        {d.risk_seviyesi === 'KRITIK' && <AlertTriangle size={9} />}
                        {d.risk_seviyesi}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} />{d.tarih?.slice(5)} {d.saat}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Crosshair size={11} />{d.istanbula_uzaklik} km</span>
                      <span>{d.derinlik} km derinlik</span>
                    </div>
                    {isSelected && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <span>{t('Enlem:')} {d.enlem}</span>
                        <span>{t('Boylam:')} {d.boylam}</span>
                        <span>{t('Derinlik:')} {d.derinlik} km</span>
                        <span>{t("İstanbul'a:")} {d.istanbula_uzaklik} km</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Side panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card card-glow" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
                  <MapPin size={14} color="var(--accent)" />
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text)' }}>{t('İstanbul Analizi')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['KRITIK', 'YUKSEK', 'ORTA'].map(seviye => {
                    const sayi = depremler.filter(d => d.risk_seviyesi === seviye && d.istanbula_uzaklik < 200).length
                    if (sayi === 0 && seviye !== 'KRITIK') return null
                    return (
                      <div key={seviye} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className={`badge ${RISK_BADGE[seviye]}`}>{seviye}</span>
                        <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.85rem' }}>{sayi}</span>
                      </div>
                    )
                  })}
                  {depremler.filter(d => d.risk_seviyesi === 'KRITIK').length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', padding: '12px 0' }}>{t('Şu an kritik risk yok')}</div>
                  )}
                </div>
              </div>

              <div className="card" style={{ padding: 18 }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text)', marginBottom: 12 }}>{t('Risk Seviyeleri')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { seviye: 'KRITIK', aciklama: 'M≥5, 200km içi', renk: '#ef4444' },
                    { seviye: 'YUKSEK', aciklama: 'M≥4, 150km içi', renk: '#f97316' },
                    { seviye: 'ORTA', aciklama: 'M≥3, 100km içi', renk: '#eab308' },
                    { seviye: 'DIKKAT', aciklama: 'M≥3, Marmara', renk: '#06b6d4' },
                    { seviye: 'BILGI', aciklama: 'Düşük risk', renk: '#6b7280' },
                  ].map(l => (
                    <div key={l.seviye} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.renk, flexShrink: 0, boxShadow: `0 0 5px ${l.renk}60` }} />
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', width: 60 }}>{l.seviye}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{l.aciklama}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card" style={{ padding: 14 }}>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                  {t('Veri kaynağı: Boğaziçi Üniversitesi Kandilli Rasathanesi')}<br />
                  {t('Yedek: AFAD')}<br />
                  {t('Her 30 saniyede bir güncellenir.')}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
