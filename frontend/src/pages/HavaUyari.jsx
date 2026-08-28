import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  CloudLightning, AlertTriangle, MapPin, RefreshCw,
  BarChart3, List, Globe,
} from 'lucide-react'

// 81 il merkezi - haritada işaretleyici konumları için (backend'deki disaster_utils.IL_MERKEZLERI ile aynı)
const IL_MERKEZLERI = {
  "Adana": [37.0000, 35.3213], "Adıyaman": [37.7648, 38.2786], "Afyonkarahisar": [38.7507, 30.5567],
  "Ağrı": [39.7191, 43.0503], "Amasya": [40.6499, 35.8353], "Ankara": [39.9334, 32.8597],
  "Antalya": [36.8969, 30.7133], "Artvin": [41.1828, 41.8183], "Aydın": [37.8560, 27.8416],
  "Balıkesir": [39.6484, 27.8826], "Bilecik": [40.1451, 29.9798], "Bingöl": [38.8855, 40.4966],
  "Bitlis": [38.4006, 42.1095], "Bolu": [40.5760, 31.5788], "Burdur": [37.7203, 30.2908],
  "Bursa": [40.1885, 29.0610], "Çanakkale": [40.1553, 26.4142], "Çankırı": [40.6013, 33.6134],
  "Çorum": [40.5506, 34.9556], "Denizli": [37.7765, 29.0864], "Diyarbakır": [37.9144, 40.2306],
  "Edirne": [41.6771, 26.5557], "Elazığ": [38.6810, 39.2264], "Erzincan": [39.7500, 39.5000],
  "Erzurum": [39.9000, 41.2700], "Eskişehir": [39.7767, 30.5206], "Gaziantep": [37.0662, 37.3833],
  "Giresun": [40.9128, 38.3895], "Gümüşhane": [40.4386, 39.5086], "Hakkari": [37.5744, 43.7408],
  "Hatay": [36.4018, 36.3498], "Isparta": [37.7648, 30.5566], "Mersin": [36.8000, 34.6333],
  "İstanbul": [41.0082, 28.9784], "İzmir": [38.4237, 27.1428], "Kars": [40.6167, 43.1000],
  "Kastamonu": [41.3887, 33.7827], "Kayseri": [38.7312, 35.4787], "Kırklareli": [41.7333, 27.2167],
  "Kırşehir": [39.1425, 34.1709], "Kocaeli": [40.8533, 29.8815], "Konya": [37.8746, 32.4932],
  "Kütahya": [39.4167, 29.9833], "Malatya": [38.3552, 38.3095], "Manisa": [38.6191, 27.4289],
  "Kahramanmaraş": [37.5858, 36.9371], "Mardin": [37.3212, 40.7245], "Muğla": [37.2153, 28.3636],
  "Muş": [38.9462, 41.7539], "Nevşehir": [38.6939, 34.6857], "Niğde": [37.9667, 34.6833],
  "Ordu": [40.9862, 37.8797], "Rize": [41.0201, 40.5234], "Sakarya": [40.7569, 30.3781],
  "Samsun": [41.2867, 36.3300], "Siirt": [37.9333, 41.9500], "Sinop": [42.0231, 35.1531],
  "Sivas": [39.7477, 37.0179], "Tekirdağ": [40.9833, 27.5167], "Tokat": [40.3167, 36.5500],
  "Trabzon": [41.0027, 39.7168], "Tunceli": [39.1079, 39.5401], "Şanlıurfa": [37.1591, 38.7969],
  "Uşak": [38.6823, 29.4082], "Van": [38.4891, 43.4089], "Yozgat": [39.8181, 34.8147],
  "Zonguldak": [41.4564, 31.7987], "Aksaray": [38.3687, 34.0370], "Bayburt": [40.2552, 40.2249],
  "Karaman": [37.1759, 33.2287], "Kırıkkale": [39.8468, 33.5153], "Batman": [37.8812, 41.1351],
  "Şırnak": [37.4187, 42.4918], "Bartın": [41.6344, 32.3375], "Ardahan": [41.1105, 42.7022],
  "Iğdır": [39.9167, 44.0333], "Yalova": [40.6500, 29.2667], "Karabük": [41.2061, 32.6204],
  "Kilis": [36.7184, 37.1212], "Osmaniye": [37.0742, 36.2478], "Düzce": [40.8438, 31.1565],
}

const SEVIYE_COLOR = { KRITIK: '#ef4444', YUKSEK: '#f97316', DIKKAT: '#eab308' }
const SEVIYE_BADGE_CLASS = { KRITIK: 'badge-red', YUKSEK: 'badge-yellow', DIKKAT: 'badge-yellow' }

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

export default function HavaUyari() {
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

  const [uyarilar, setUyarilar] = useState([])
  const [stats, setStats] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState(null)
  const [sonGuncelleme, setSonGuncelleme] = useState(null)
  const [countdown, setCountdown] = useState(300)
  const countdownRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const [uyariData, statsData] = await Promise.all([
        api('/api/hava/uyarilar'),
        api('/api/hava/stats'),
      ])
      setUyarilar(uyariData?.uyarilar || [])
      if (statsData) setStats(statsData)
      setHata(null)
      setSonGuncelleme(new Date().toLocaleTimeString('tr-TR'))
      setYukleniyor(false)
      setCountdown(300)
    } catch {
      setHata(t('Hava durumu uyarıları alınamadı.'))
      setYukleniyor(false)
    }
  }, [t])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 300000)
    return () => clearInterval(iv)
  }, [fetchData])

  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown(c => c <= 1 ? 300 : c - 1), 1000)
    return () => clearInterval(countdownRef.current)
  }, [])

  const renderStats = () => stats && (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12 }}>
      <StatCard icon={CloudLightning} iconColor="#eab308" label={t('Toplam Uyarı')} value={stats.toplam} />
      <StatCard icon={AlertTriangle} iconColor="#ef4444" label={t('Kritik')} value={stats.kritik} />
      <StatCard icon={AlertTriangle} iconColor="#f97316" label={t('Yüksek')} value={stats.yuksek} />
    </div>
  )

  const renderList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        {uyarilar.length} {t('uyarı listeleniyor')}
        {sonGuncelleme && <span style={{ marginLeft: 8 }}>· {t('Güncellendi')}: {sonGuncelleme}</span>}
      </div>
      {uyarilar.length === 0 && <div className="empty-state">{t('Şu an aktif hava durumu uyarısı yok.')}</div>}
      {uyarilar.map((w, i) => {
        const renk = SEVIYE_COLOR[w.seviye] || '#6b7280'
        return (
          <div key={`${w.il}_${w.tur}_${i}`} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <MapPin size={13} color={renk} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{w.il}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{w.tur}</span>
              </div>
              <span className={`badge ${SEVIYE_BADGE_CLASS[w.seviye] || 'badge-gray'}`}>{w.seviye}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              {t('Kaynak')}: {w.kaynak}
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderMap = (heightValue) => (
    <div className="card" style={{ overflow: 'hidden', height: heightValue, padding: 0 }}>
      <MapContainer center={[39.0, 35.0]} zoom={5.5} scrollWheelZoom style={{ height: '100%', width: '100%', background: '#0d1117' }}>
        <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" subdomains="abcd" maxZoom={19} />
        {uyarilar.filter(w => IL_MERKEZLERI[w.il]).map((w, i) => {
          const renk = SEVIYE_COLOR[w.seviye] || '#6b7280'
          return (
            <CircleMarker key={`${w.il}_${i}`} center={IL_MERKEZLERI[w.il]} radius={12}
              pathOptions={{ color: renk, fillColor: renk, fillOpacity: 0.5, weight: 2 }}>
              <Popup>
                <div style={{ minWidth: 160, fontSize: '0.78rem' }}>
                  <div style={{ fontWeight: 800, color: renk, marginBottom: 4 }}>{w.il} — {w.seviye}</div>
                  <div>{w.tur}</div>
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
            <CloudLightning size={16} color="#eab308" /> {t('Aşırı Hava')}
          </h2>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>MGM</span>
        </div>
      ) : (
        <h2 className="page-title">
          <span className="page-title-icon" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)' }}>
            <CloudLightning size={18} color="#eab308" />
          </span>
          {t('Aşırı Hava Uyarıları')}
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
          {activeTab === 'map' && renderMap('calc(100vh - 260px)')}
          {activeTab === 'list' && renderList()}
          {activeTab === 'stats' && renderStats()}
        </div>
      )}
    </div>
  )

  const renderDesktopLayout = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className="animate-fade-in">
      {header(false)}
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
