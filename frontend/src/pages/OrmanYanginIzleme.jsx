import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Flame, AlertTriangle, MapPin, Clock, RefreshCw,
  ChevronDown, ChevronUp, Filter, BarChart3, Globe,
  List, Zap, Satellite, Settings as SettingsIcon,
} from 'lucide-react'

const RISK_COLOR = { KRITIK: '#ef4444', YUKSEK: '#f97316', ORTA: '#eab308', DIKKAT: '#6b7280' }
const RISK_BADGE_CLASS = { KRITIK: 'badge-red', YUKSEK: 'badge-yellow', ORTA: 'badge-yellow', DIKKAT: 'badge-gray' }
const RISK_ORDER = { KRITIK: 0, YUKSEK: 1, ORTA: 2, DIKKAT: 3 }

function StatCard({ icon: Icon, iconColor, label, value, sub, pulse }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 140,
      position: 'relative', overflow: 'hidden',
    }}>
      {pulse && <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at left top, ${iconColor}08 0%, transparent 70%)`, pointerEvents: 'none' }} />}
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

function FireCircle({ f, secili, setSecili }) {
  const renk = RISK_COLOR[f.risk_seviyesi] || '#6b7280'
  const yaricap = Math.max(5, Math.min(22, Math.sqrt(f.frp || 1) * 2.5))
  const isSelected = secili?.id === f.id
  return (
    <CircleMarker
      center={[f.enlem, f.boylam]}
      radius={yaricap}
      pathOptions={{ color: renk, fillColor: renk, fillOpacity: isSelected ? 0.85 : 0.4, weight: isSelected ? 3 : 1.5 }}
      eventHandlers={{ click: () => setSecili(f) }}
    >
      <Popup>
        <div style={{ minWidth: 200, fontSize: '0.78rem' }}>
          <div style={{ fontWeight: 800, color: renk, marginBottom: 4, fontSize: '0.88rem' }}>
            {f.risk_seviyesi} · FRP {f.frp} MW
          </div>
          <div style={{ color: '#e5e7eb', marginBottom: 4, fontWeight: 500 }}>{f.il || 'Bilinmeyen il'} yakını</div>
          <div style={{ color: '#9ca3af', marginBottom: 4 }}>🕐 {f.acq_date} {f.acq_time}</div>
          <div style={{ color: '#9ca3af' }}>🛰️ {f.satellite} ({f.instrument})</div>
        </div>
      </Popup>
    </CircleMarker>
  )
}

export default function OrmanYanginIzleme() {
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

  const [fires, setFires] = useState([])
  const [stats, setStats] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState(null)
  const [apiKeyEksik, setApiKeyEksik] = useState(false)
  const [sonGuncelleme, setSonGuncelleme] = useState(null)
  const [gun, setGun] = useState(3)
  const [secili, setSecili] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const countdownRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const [fireData, statsData] = await Promise.all([
        api(`/api/yangin/aktif?gun=${gun}`),
        api(`/api/yangin/stats?gun=${gun}`),
      ])
      if (fireData?.error) {
        setApiKeyEksik(true)
        setFires([])
      } else {
        setApiKeyEksik(false)
        const sorted = (fireData?.fires || []).sort((a, b) => (RISK_ORDER[a.risk_seviyesi] ?? 9) - (RISK_ORDER[b.risk_seviyesi] ?? 9))
        setFires(sorted)
      }
      if (statsData) setStats(statsData)
      setHata(null)
      setSonGuncelleme(new Date().toLocaleTimeString('tr-TR'))
      setYukleniyor(false)
      setCountdown(60)
    } catch {
      setHata(t('Yangın verileri alınamadı.'))
      setYukleniyor(false)
    }
  }, [gun, t])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 60000)
    return () => clearInterval(iv)
  }, [fetchData])

  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown(c => c <= 1 ? 60 : c - 1), 1000)
    return () => clearInterval(countdownRef.current)
  }, [])

  const kritikSayisi = fires.filter(f => f.risk_seviyesi === 'KRITIK').length

  const renderFilters = () => (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Zaman Aralığı
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[1, 3, 7, 10].map(g => (
          <button key={g} onClick={() => setGun(g)} style={{
            fontSize: '0.75rem', fontWeight: 700, padding: '5px 14px', borderRadius: 7,
            border: `1px solid ${gun === g ? 'var(--accent)' : 'var(--border)'}`,
            background: gun === g ? 'var(--accent-glow)' : 'var(--bg-elevated)',
            color: gun === g ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
          }}>
            {g} {t('gün')}
          </button>
        ))}
      </div>
    </div>
  )

  const renderApiKeyWarning = () => (
    <div className="card" style={{ padding: 18, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <SettingsIcon size={16} color="#f59e0b" />
        <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.85rem' }}>{t('FIRMS API Anahtarı Gerekli')}</span>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
        {t('Yangın verisi için ücretsiz bir NASA FIRMS MAP_KEY gerekiyor.')}{' '}
        <a href="https://firms.modaps.eosdis.nasa.gov/api/map_key/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
          firms.modaps.eosdis.nasa.gov
        </a>{' '}
        {t('adresinden e-posta ile alıp Ayarlar sayfasına girin.')}
      </p>
    </div>
  )

  const renderStats = () => stats && (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
      <StatCard icon={Flame} iconColor="#f97316" label={t('Toplam Yangın')} value={stats.toplam} sub={`son ${gun} gün`} pulse={stats.toplam > 0} />
      <StatCard icon={AlertTriangle} iconColor="#ef4444" label={t('Kritik')} value={stats.kritik} pulse={stats.kritik > 0} />
      <StatCard icon={Zap} iconColor="#eab308" label={t('Ort. FRP')} value={`${stats.ortalama_frp} MW`} />
      <StatCard icon={Zap} iconColor="#ef4444" label={t('Maks FRP')} value={`${stats.maks_frp} MW`} />
    </div>
  )

  const renderList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        {fires.length} {t('yangın listeleniyor')}
        {sonGuncelleme && <span style={{ marginLeft: 8 }}>· {t('Güncellendi')}: {sonGuncelleme}</span>}
      </div>
      {fires.length === 0 && !apiKeyEksik && <div className="empty-state">{t('Şu an aktif yangın tespiti yok.')}</div>}
      {fires.slice(0, 100).map((f) => {
        const renk = RISK_COLOR[f.risk_seviyesi] || '#6b7280'
        const isSelected = secili?.id === f.id
        return (
          <div key={f.id} onClick={() => setSecili(isSelected ? null : f)} style={{
            background: isSelected ? `${renk}0a` : 'var(--bg-card)',
            border: `1px solid ${isSelected ? renk + '45' : 'var(--border)'}`,
            borderRadius: 12, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
                <div style={{ padding: '4px 11px', borderRadius: 8, background: `${renk}18`, border: `1px solid ${renk}35`, fontSize: '0.85rem', fontWeight: 800, color: renk, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Flame size={12} /> {f.frp} MW
                </div>
                <span style={{ fontSize: '0.82rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.il ? `${f.il} yakını` : t('Bilinmeyen konum')}
                </span>
              </div>
              <span className={`badge ${RISK_BADGE_CLASS[f.risk_seviyesi] || 'badge-gray'}`}>{f.risk_seviyesi}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.68rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> {f.acq_date} {f.acq_time}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={10} /> {f.il_uzaklik_km} km</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Satellite size={10} /> {f.satellite}</span>
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderSidePanel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text)', marginBottom: 12 }}>{t('Risk Seviyeleri')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[
            { seviye: 'KRITIK', aciklama: 'Yüksek güven + FRP≥50MW', renk: '#ef4444' },
            { seviye: 'YUKSEK', aciklama: 'Yüksek güven veya FRP≥30MW', renk: '#f97316' },
            { seviye: 'ORTA', aciklama: 'Orta güven tespiti', renk: '#eab308' },
            { seviye: 'DIKKAT', aciklama: 'Düşük güven tespiti', renk: '#6b7280' },
          ].map(l => (
            <div key={l.seviye} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.73rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.renk, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)', width: 65 }}>{l.seviye}</span>
              <span style={{ color: 'var(--text-muted)' }}>{l.aciklama}</span>
            </div>
          ))}
        </div>
      </div>
      {stats?.etkilenen_iller?.length > 0 && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <Globe size={13} color="var(--text-muted)" />
            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text)' }}>{t('Etkilenen İller')}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {stats.etkilenen_iller.map(il => (
              <span key={il} className="badge badge-gray">{il}</span>
            ))}
          </div>
        </div>
      )}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          {t('Veri Kaynağı')}
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>
          <a href="https://firms.modaps.eosdis.nasa.gov" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>NASA FIRMS</a>
          {' '}(VIIRS Uydu Verisi)<br />
          <span style={{ fontSize: '0.62rem', opacity: 0.7 }}>{t('Her 60 saniyede güncellenir')}</span>
        </p>
      </div>
    </div>
  )

  const renderMap = (heightValue) => (
    <div className="card" style={{ overflow: 'hidden', height: heightValue, padding: 0 }}>
      <MapContainer center={[39.0, 35.0]} zoom={5.5} scrollWheelZoom style={{ height: '100%', width: '100%', background: '#0d1117' }}>
        <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" subdomains="abcd" maxZoom={19} />
        {fires.map(f => <FireCircle key={f.id} f={f} secili={secili} setSecili={setSecili} />)}
      </MapContainer>
    </div>
  )

  const header = (mobile) => (
    <div className={mobile ? '' : 'page-header'} style={mobile ? { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 } : {}}>
      {mobile ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Flame size={16} color="#f97316" /> {t('Orman Yangını')}
          </h2>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>NASA FIRMS</span>
        </div>
      ) : (
        <h2 className="page-title">
          <span className="page-title-icon" style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)' }}>
            <Flame size={18} color="#f97316" />
          </span>
          {t('Orman Yangını İzleme')}
        </h2>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={() => setShowFilters(p => !p)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Filter size={11} /> {t('Filtreler')}
        </button>
        <button onClick={fetchData} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={11} /> <span style={{ fontSize: '0.65rem' }}>{countdown}s</span>
        </button>
      </div>
    </div>
  )

  const renderMobileLayout = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} className="animate-fade-in">
      {header(true)}
      {showFilters && renderFilters()}
      {apiKeyEksik && renderApiKeyWarning()}
      {hata && (
        <div style={{ background: 'var(--red-glow)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: 12, color: 'var(--red)', fontSize: '0.8rem', display: 'flex', gap: 8 }}>
          <AlertTriangle size={14} /> {hata}
        </div>
      )}
      <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 3, position: 'sticky', top: 0, zIndex: 100 }}>
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
        <div style={{ minHeight: 350 }}>
          {activeTab === 'map' && renderMap('calc(100vh - 260px)')}
          {activeTab === 'list' && renderList()}
          {activeTab === 'stats' && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{renderStats()}{renderSidePanel()}</div>}
        </div>
      )}
    </div>
  )

  const renderDesktopLayout = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className="animate-fade-in">
      {header(false)}
      {showFilters && renderFilters()}
      {apiKeyEksik && renderApiKeyWarning()}
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
          {renderMap(400)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gap: 16, alignItems: 'start' }}>
            {renderList()}
            {renderSidePanel()}
          </div>
        </>
      )}
    </div>
  )

  return isMobile ? renderMobileLayout() : renderDesktopLayout()
}
