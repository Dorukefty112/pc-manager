import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Waves, AlertTriangle, MapPin, RefreshCw, Info,
  BarChart3, List, TrendingUp,
} from 'lucide-react'

const RISK_COLOR = { KRITIK: '#ef4444', YUKSEK: '#f97316', ORTA: '#eab308', NORMAL: '#22c55e' }
const RISK_BADGE_CLASS = { KRITIK: 'badge-red', YUKSEK: 'badge-yellow', ORTA: 'badge-yellow', NORMAL: 'badge-green' }

function StatCard({ icon: Icon, iconColor, label, value, sub }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 140,
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: `${iconColor}18`, border: `1px solid ${iconColor}35`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={iconColor} />
      </div>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function SelIzleme() {
  const { t } = useI18n()
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [activeTab, setActiveTab] = useState('list')

  useEffect(() => {
    const onResize = () => {
      const m = window.innerWidth < 768
      setIsMobile(m)
      if (!m) setActiveTab('list')
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const [noktalar, setNoktalar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState(null)
  const [sonGuncelleme, setSonGuncelleme] = useState(null)
  const [secili, setSecili] = useState(null)
  const [countdown, setCountdown] = useState(120)
  const countdownRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const data = await api('/api/sel/aktif')
      setNoktalar(data?.noktalar || [])
      setHata(null)
      setSonGuncelleme(new Date().toLocaleTimeString('tr-TR'))
      setYukleniyor(false)
      setCountdown(120)
    } catch {
      setHata(t('Taşkın verileri alınamadı.'))
      setYukleniyor(false)
    }
  }, [t])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 120000)
    return () => clearInterval(iv)
  }, [fetchData])

  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown(c => c <= 1 ? 120 : c - 1), 1000)
    return () => clearInterval(countdownRef.current)
  }, [])

  const gecerliNoktalar = noktalar.filter(n => !n.hata)
  const hataliNoktalar = noktalar.filter(n => n.hata)
  const kritikSayisi = gecerliNoktalar.filter(n => n.risk_seviyesi === 'KRITIK').length
  const yuksekSayisi = gecerliNoktalar.filter(n => n.risk_seviyesi === 'YUKSEK').length
  const ortOran = gecerliNoktalar.length ? (gecerliNoktalar.reduce((s, n) => s + (n.oran || 0), 0) / gecerliNoktalar.length).toFixed(2) : '-'

  const renderDisclaimer = () => (
    <div className="card" style={{ padding: 16, border: '1px solid rgba(6,182,212,0.25)', background: 'rgba(6,182,212,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Info size={14} color="var(--accent)" />
        <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.8rem' }}>{t('Deneysel İzleme')}</span>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
        {t('Bu resmi bir AFAD/DSİ taşkın uyarısı değildir — AFAD ve DSİ açık bir taşkın API\'si sağlamıyor. Burada, seçili nehir noktalarındaki güncel debinin son 90 günlük geçmiş verilere göre normalin kaç katı olduğu (Open-Meteo Flood API / Copernicus GloFAS) gösteriliyor.')}
      </p>
    </div>
  )

  const renderStats = () => (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
      <StatCard icon={Waves} iconColor="#06b6d4" label={t('İzlenen Nokta')} value={noktalar.length} />
      <StatCard icon={AlertTriangle} iconColor="#ef4444" label={t('Kritik')} value={kritikSayisi} />
      <StatCard icon={AlertTriangle} iconColor="#f97316" label={t('Yüksek')} value={yuksekSayisi} />
      <StatCard icon={TrendingUp} iconColor="#22c55e" label={t('Ort. Oran')} value={gecerliNoktalar.length ? `${ortOran}x` : '—'} sub={t('normale göre')} />
    </div>
  )

  const renderList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        {gecerliNoktalar.length} {t('nokta izleniyor')}
        {sonGuncelleme && <span style={{ marginLeft: 8 }}>· {t('Güncellendi')}: {sonGuncelleme}</span>}
      </div>
      {noktalar.map((n) => {
        const renk = RISK_COLOR[n.risk_seviyesi] || '#6b7280'
        const isSelected = secili?.nokta === n.nokta
        return (
          <div key={n.nokta} onClick={() => !n.hata && setSecili(isSelected ? null : n)} style={{
            background: isSelected ? `${renk}0a` : 'var(--bg-card)',
            border: `1px solid ${isSelected ? renk + '45' : 'var(--border)'}`,
            borderRadius: 12, padding: '12px 14px', cursor: n.hata ? 'default' : 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{n.nokta}</span>
              {n.hata ? (
                <span className="badge badge-gray">{n.hata}</span>
              ) : (
                <span className={`badge ${RISK_BADGE_CLASS[n.risk_seviyesi] || 'badge-gray'}`}>{n.risk_seviyesi}</span>
              )}
            </div>
            {!n.hata && (
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span>{t('Güncel')}: <b style={{ color: 'var(--text)' }}>{n.guncel_debi} m³/s</b></span>
                <span>{t('Eşik (p90)')}: <b style={{ color: 'var(--text)' }}>{n.esik_debi} m³/s</b></span>
                <span>{t('Oran')}: <b style={{ color: renk }}>{n.oran}x</b></span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  const renderMap = (heightValue) => (
    <div className="card" style={{ overflow: 'hidden', height: heightValue, padding: 0 }}>
      <MapContainer center={[39.0, 35.0]} zoom={5.5} scrollWheelZoom style={{ height: '100%', width: '100%', background: '#0d1117' }}>
        <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" subdomains="abcd" maxZoom={19} />
        {gecerliNoktalar.map(n => {
          const renk = RISK_COLOR[n.risk_seviyesi] || '#6b7280'
          return (
            <CircleMarker
              key={n.nokta}
              center={[n.enlem, n.boylam]}
              radius={Math.max(8, Math.min(20, (n.oran || 1) * 10))}
              pathOptions={{ color: renk, fillColor: renk, fillOpacity: 0.5, weight: 2 }}
              eventHandlers={{ click: () => setSecili(n) }}
            >
              <Popup>
                <div style={{ minWidth: 180, fontSize: '0.78rem' }}>
                  <div style={{ fontWeight: 800, color: renk, marginBottom: 4 }}>{n.nokta}</div>
                  <div>{t('Güncel debi')}: {n.guncel_debi} m³/s</div>
                  <div>{t('Normalin')} {n.oran}x'i</div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )

  const header = (mobile) => (
    <div className={mobile ? '' : 'page-header'} style={mobile ? { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 } : {}}>
      {mobile ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Waves size={16} color="#06b6d4" /> {t('Sel/Taşkın')}
          </h2>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Open-Meteo Flood API</span>
        </div>
      ) : (
        <h2 className="page-title">
          <span className="page-title-icon" style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)' }}>
            <Waves size={18} color="#06b6d4" />
          </span>
          {t('Sel/Taşkın İzleme')}
        </h2>
      )}
      <button onClick={fetchData} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
        <RefreshCw size={11} /> <span style={{ fontSize: '0.65rem' }}>{countdown}s</span>
      </button>
    </div>
  )

  const renderMobileLayout = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} className="animate-fade-in">
      {header(true)}
      {renderDisclaimer()}
      {hata && (
        <div style={{ background: 'var(--red-glow)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: 12, color: 'var(--red)', fontSize: '0.8rem', display: 'flex', gap: 8 }}>
          <AlertTriangle size={14} /> {hata}
        </div>
      )}
      <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 3 }}>
        {[{ id: 'list', label: t('Liste'), icon: List }, { id: 'map', label: t('Harita'), icon: MapPin }, { id: 'stats', label: t('İstatistik'), icon: BarChart3 }].map(tab => {
          const Icon = tab.icon
          const isAct = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontSize: '0.78rem', fontWeight: isAct ? 800 : 500, padding: '9px 4px', borderRadius: 9,
              background: isAct ? 'var(--bg-card)' : 'transparent', border: isAct ? '1px solid var(--border)' : '1px solid transparent',
              color: isAct ? 'var(--accent)' : 'var(--text-secondary)',
            }}>
              <Icon size={13} /> {tab.label}
            </button>
          )
        })}
      </div>
      {yukleniyor ? (
        <div className="empty-state"><div className="spinner spinner-lg" />{t('Yükleniyor...')}</div>
      ) : (
        <div style={{ minHeight: 300 }}>
          {activeTab === 'map' && renderMap('calc(100vh - 300px)')}
          {activeTab === 'list' && renderList()}
          {activeTab === 'stats' && renderStats()}
        </div>
      )}
    </div>
  )

  const renderDesktopLayout = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className="animate-fade-in">
      {header(false)}
      {renderDisclaimer()}
      {hata && (
        <div style={{ background: 'var(--red-glow)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '12px 16px', color: 'var(--red)', fontSize: '0.85rem', display: 'flex', gap: 10 }}>
          <AlertTriangle size={15} /> {hata}
        </div>
      )}
      {renderStats()}
      {yukleniyor ? (
        <div className="empty-state"><div className="spinner spinner-lg" />{t('Yükleniyor...')}</div>
      ) : (
        <>
          {renderMap(380)}
          {renderList()}
        </>
      )}
    </div>
  )

  return isMobile ? renderMobileLayout() : renderDesktopLayout()
}
