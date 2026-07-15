import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Activity, AlertTriangle, MapPin, Clock, Crosshair,
  Bell, BellOff, RefreshCw, Waves, Eye, ChevronDown,
  ChevronUp, Radio, Filter, BarChart3, Globe, Shield,
  Zap, CheckCircle, Info, TrendingUp
} from 'lucide-react'

// ─── Sabitler ────────────────────────────────────────────────────────────────

const ISTANBUL_LAT = 41.0082
const ISTANBUL_LON = 28.9784

const RISK_COLOR = {
  KRITIK:    '#ef4444',
  YUKSEK:    '#f97316',
  ORTA:      '#eab308',
  DIKKAT:    '#06b6d4',
  BILGI:     '#6b7280',
  BILINMIYOR:'#6b7280',
}

const RISK_BADGE_CLASS = {
  KRITIK:    'badge-red',
  YUKSEK:    'badge-yellow',
  ORTA:      'badge-yellow',
  DIKKAT:    'badge-cyan',
  BILGI:     'badge-gray',
  BILINMIYOR:'badge-gray',
}

const RISK_ORDER = { KRITIK: 0, YUKSEK: 1, ORTA: 2, DIKKAT: 3, BILGI: 4, BILINMIYOR: 5 }

const SOURCE_STYLE = {
  kandilli: { bg: '#7c3aed22', border: '#7c3aed55', text: '#a78bfa', label: 'Kandilli' },
  afad:     { bg: '#1e40af22', border: '#1e40af55', text: '#60a5fa', label: 'AFAD' },
  usgs:     { bg: '#15803d22', border: '#15803d55', text: '#4ade80', label: 'USGS' },
  noa:      { bg: '#0891b222', border: '#0891b255', text: '#22d3ee', label: 'NOA' },
  emsc:     { bg: '#b4530022', border: '#b4530055', text: '#fb923c', label: 'EMSC' },
  gfz:      { bg: '#71717a22', border: '#71717a55', text: '#a1a1aa', label: 'GFZ' },
  iris:     { bg: '#d9770622', border: '#d9770655', text: '#fbbf24', label: 'IRIS' },
  turhec:   { bg: '#be123c22', border: '#be123c55', text: '#fb7185', label: 'TURHEC' },
}

const PAGER_COLOR = {
  green:  { bg: '#166534', border: '#16a34a', text: '#4ade80', label: 'Düşük' },
  yellow: { bg: '#713f12', border: '#ca8a04', text: '#fbbf24', label: 'Orta' },
  orange: { bg: '#7c2d12', border: '#ea580c', text: '#fb923c', label: 'Yüksek' },
  red:    { bg: '#7f1d1d', border: '#dc2626', text: '#f87171', label: 'Kritik' },
}

const AVAILABLE_SOURCES = [
  { id: 'kandilli', label: 'Kandilli' },
  { id: 'afad',     label: 'AFAD' },
  { id: 'usgs',     label: 'USGS' },
  { id: 'noa',      label: 'NOA' },
  { id: 'emsc',     label: 'EMSC' },
  { id: 'gfz',      label: 'GFZ' },
]

// ─── Yardımcı bileşenler ─────────────────────────────────────────────────────

function StatCard({ icon: Icon, iconColor, label, value, sub, pulse }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      flex: 1,
      minWidth: 140,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {pulse && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at left top, ${iconColor}08 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `${iconColor}18`, border: `1px solid ${iconColor}35`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
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

function SourceBadge({ source }) {
  const s = SOURCE_STYLE[source?.toLowerCase()] || SOURCE_STYLE.gfz
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 5,
      background: s.bg, border: `1px solid ${s.border}`, color: s.text,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {s.label}
    </span>
  )
}

function QualityBadge({ quality }) {
  if (!quality || quality === 'automatic') return (
    <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
      <Zap size={9} /> Otomatik
    </span>
  )
  return (
    <span style={{ fontSize: '0.63rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 3 }}>
      <CheckCircle size={9} /> İncelenmiş
    </span>
  )
}

function MagnitudeTypes({ d }) {
  const types = []
  if (d.magnitude_ml != null && d.magnitude_ml > 0) types.push({ type: 'Ml', val: d.magnitude_ml })
  if (d.magnitude_md != null && d.magnitude_md > 0) types.push({ type: 'Md', val: d.magnitude_md })
  if (d.magnitude_mw != null && d.magnitude_mw > 0) types.push({ type: 'Mw', val: d.magnitude_mw })
  if (types.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {types.map(({ type, val }) => (
        <span key={type} style={{
          fontSize: '0.65rem', padding: '2px 7px', borderRadius: 5,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
        }}>
          {type} {val.toFixed(2)}
        </span>
      ))}
    </div>
  )
}

// Harita: seçili depreme odaklan
function MapFlyTo({ deprem }) {
  const map = useMap()
  useEffect(() => {
    if (deprem?.enlem && deprem?.boylam) {
      map.flyTo([deprem.enlem, deprem.boylam], Math.max(map.getZoom(), 8), { animate: true, duration: 0.8 })
    }
  }, [deprem, map])
  return null
}

function DepremCircle({ d, secili, setSecili }) {
  const renk = RISK_COLOR[d.risk_seviyesi] || '#6b7280'
  const yaricap = Math.max(5, Math.min(24, (d.magnitude > 0 ? d.magnitude : 1) * 4.5))
  const isSelected = secili?.id === d.id || (secili?.occurred_at === d.occurred_at && secili?.enlem === d.enlem)
  const srcStyle = SOURCE_STYLE[d.source] || SOURCE_STYLE.gfz

  return (
    <CircleMarker
      center={[d.enlem, d.boylam]}
      radius={yaricap}
      pathOptions={{
        color: d.tsunami ? '#fbbf24' : renk,
        fillColor: d.tsunami ? '#fbbf24' : renk,
        fillOpacity: isSelected ? 0.85 : 0.35,
        weight: isSelected ? 3 : d.tsunami ? 2.5 : 1.5,
      }}
      eventHandlers={{ click: () => setSecili(d) }}
    >
      <Popup>
        <div style={{ minWidth: 210, fontSize: '0.78rem', fontFamily: 'inherit' }}>
          <div style={{ fontWeight: 800, color: renk, marginBottom: 4, fontSize: '0.88rem' }}>
            M{d.magnitude > 0 ? d.magnitude.toFixed(1) : '-.-'} — {d.risk_seviyesi}
          </div>
          <div style={{ color: '#e5e7eb', marginBottom: 4, fontWeight: 500 }}>{d.yer}</div>
          {d.geo_location && d.geo_location !== d.yer && (
            <div style={{ color: '#9ca3af', fontSize: '0.7rem', marginBottom: 4 }}>{d.geo_location}</div>
          )}
          <div style={{ color: '#9ca3af', marginBottom: 4 }}>
            🕐 {d.occurred_at?.slice(0, 19).replace('T', ' ')}
          </div>
          <div style={{ color: '#9ca3af', marginBottom: 6 }}>📏 {d.derinlik} km derinlik</div>

          {d.sources?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
              {d.sources.map((s, i) => <SourceBadge key={i} source={s.name} />)}
            </div>
          )}

          {d.tsunami && (
            <div style={{ background: '#78350f', border: '1px solid #d97706', borderRadius: 6, padding: '4px 8px', color: '#fbbf24', fontSize: '0.7rem', marginTop: 4 }}>
              🌊 Tsunami Uyarısı
            </div>
          )}
          {d.felt_count > 0 && (
            <div style={{ color: '#9ca3af', fontSize: '0.68rem', marginTop: 4 }}>
              👁 {d.felt_count} kişi hissetti
            </div>
          )}
        </div>
      </Popup>
    </CircleMarker>
  )
}

function IstanbulMarker() {
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;background:#06b6d4;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px #06b6d4aa"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
  return <Marker position={[ISTANBUL_LAT, ISTANBUL_LON]} icon={icon} />
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

export default function DepremUyari() {
  const { t } = useI18n()

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Veri
  const [depremler, setDepremler]   = useState([])
  const [stats, setStats]           = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata]             = useState(null)
  const [sonGuncelleme, setSonGuncelleme] = useState(null)

  // UI state
  const [secili, setSecili]         = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [bildirim, setBildirim]     = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [countdown, setCountdown]   = useState(30)

  // Filtreler
  const [minMag, setMinMag]         = useState(0)
  const [selectedSources, setSelectedSources] = useState([])
  const [onlyTsunami, setOnlyTsunami] = useState(false)
  const [viewFilter, setViewFilter] = useState('tum') // tum | istanbul | kritik

  const countdownRef = useRef(null)

  // ─── Veri Çekme ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set('limit', '200')
      if (minMag > 0) params.set('min_magnitude', minMag)
      if (selectedSources.length > 0) params.set('sources', selectedSources.join(','))

      const [data, statsData] = await Promise.all([
        api(`/api/deprem/sismik?${params.toString()}`),
        api('/api/deprem/sismik/stats'),
      ])

      if (Array.isArray(data)) {
        const sorted = data.sort((a, b) => {
          const rA = RISK_ORDER[a.risk_seviyesi] ?? 5
          const rB = RISK_ORDER[b.risk_seviyesi] ?? 5
          if (rA !== rB) return rA - rB
          return new Date(b.occurred_at) - new Date(a.occurred_at)
        })
        setDepremler(sorted)
        setHata(null)
      }
      if (statsData) setStats(statsData)
      setSonGuncelleme(new Date().toLocaleTimeString('tr-TR'))
      setYukleniyor(false)
      setCountdown(30)
    } catch {
      setHata(t('Deprem verileri alınamadı.'))
      setYukleniyor(false)
    }
  }, [minMag, selectedSources, t])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Countdown
  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown(c => c <= 1 ? 30 : c - 1), 1000)
    return () => clearInterval(countdownRef.current)
  }, [])

  // ─── Filtreleme ────────────────────────────────────────────────────────────

  const filtreli = depremler.filter(d => {
    if (onlyTsunami && !d.tsunami) return false
    if (viewFilter === 'istanbul' && d.istanbula_uzaklik > 200) return false
    if (viewFilter === 'kritik' && !['KRITIK', 'YUKSEK', 'ORTA'].includes(d.risk_seviyesi)) return false
    return true
  })

  const toggleSource = (src) => {
    setSelectedSources(prev =>
      prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src]
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const kritikSayisi  = depremler.filter(d => d.risk_seviyesi === 'KRITIK').length
  const tsunamiSayisi = depremler.filter(d => d.tsunami).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className="animate-fade-in">

      {/* ── Başlık ── */}
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon" style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)' }}>
            <Activity size={18} color="#f97316" />
          </span>
          {t('Deprem İzleme')}
          <span style={{ fontSize: '0.65rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', boxShadow: '0 0 6px #4ade80' }} />
            Sismik Harita
          </span>
        </h2>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Görünüm filtresi */}
          <select
            value={viewFilter}
            onChange={e => setViewFilter(e.target.value)}
            style={{ fontSize: '0.82rem', borderRadius: 9, padding: '6px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="tum">{t('Tümü')}</option>
            <option value="istanbul">{t('İstanbul Çevresi (&lt;200km)')}</option>
            <option value="kritik">{t('Kritik Olanlar')}</option>
          </select>

          {/* Filtreler toggle */}
          <button
            onClick={() => setShowFilters(p => !p)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', padding: '6px 12px' }}
          >
            <Filter size={13} />
            {t('Filtreler')}
            {(minMag > 0 || selectedSources.length > 0 || onlyTsunami) && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
            )}
          </button>

          {/* Bildirim */}
          <button
            onClick={() => setBildirim(p => !p)}
            className="btn-icon"
            style={{
              background: bildirim ? 'var(--accent-glow)' : 'var(--bg-elevated)',
              color: bildirim ? 'var(--accent)' : 'var(--text-muted)',
              borderColor: bildirim ? 'rgba(6,182,212,0.3)' : 'var(--border)',
            }}
          >
            {bildirim ? <Bell size={15} /> : <BellOff size={15} />}
          </button>

          {/* Yenile */}
          <button
            onClick={fetchData}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', padding: '6px 10px' }}
          >
            <RefreshCw size={13} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{countdown}s</span>
          </button>
        </div>
      </div>

      {/* ── Filtre Paneli ── */}
      {showFilters && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          alignItems: 'flex-start',
        }}>
          {/* Kaynaklar */}
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Veri Kaynakları
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {AVAILABLE_SOURCES.map(s => {
                const isActive = selectedSources.includes(s.id)
                const style = SOURCE_STYLE[s.id] || SOURCE_STYLE.gfz
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSource(s.id)}
                    style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                      border: `1px solid ${isActive ? style.border : 'var(--border)'}`,
                      background: isActive ? style.bg : 'var(--bg-elevated)',
                      color: isActive ? style.text : 'var(--text-muted)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
            {selectedSources.length > 0 && (
              <button
                onClick={() => setSelectedSources([])}
                style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, textDecoration: 'underline' }}
              >
                Tümünü sıfırla
              </button>
            )}
          </div>

          {/* Min Büyüklük */}
          <div style={{ minWidth: isMobile ? '100%' : 180 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Min Büyüklük: <span style={{ color: 'var(--accent)' }}>M{minMag.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0} max={7} step={0.5}
              value={minMag}
              onChange={e => setMinMag(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>
              <span>M0</span><span>M3.5</span><span>M7</span>
            </div>
          </div>

          {/* Tsunami */}
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Özel Filtreler
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.8rem', color: onlyTsunami ? '#fbbf24' : 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={onlyTsunami}
                onChange={e => setOnlyTsunami(e.target.checked)}
                style={{ accentColor: '#d97706', width: 14, height: 14 }}
              />
              <Waves size={13} color={onlyTsunami ? '#fbbf24' : 'var(--text-muted)'} />
              Sadece Tsunami Uyarılı
            </label>
          </div>
        </div>
      )}

      {/* ── Hata ── */}
      {hata && (
        <div style={{ background: 'var(--red-glow)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '12px 16px', color: 'var(--red)', fontSize: '0.85rem', display: 'flex', gap: 10, alignItems: 'center' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} /> {hata}
          <button onClick={fetchData} style={{ marginLeft: 'auto', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', fontSize: '0.82rem' }}>
            {t('Tekrar dene')}
          </button>
        </div>
      )}

      {/* ── İstatistik Barı ── */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard
            icon={BarChart3} iconColor="#6366f1"
            label="Toplam Deprem (DB)"
            value={stats.total?.toLocaleString('tr-TR') || '—'}
            sub="Sismik Harita arşivi"
            pulse
          />
          <StatCard
            icon={Activity} iconColor="#f97316"
            label="Bugün"
            value={stats.today || '0'}
            sub="son 24 saat"
            pulse={stats.today > 0}
          />
          <StatCard
            icon={TrendingUp} iconColor="#06b6d4"
            label="Ort. Büyüklük"
            value={stats.avg_magnitude ? `M${parseFloat(stats.avg_magnitude).toFixed(1)}` : '—'}
          />
          <StatCard
            icon={Zap} iconColor="#ef4444"
            label="Maks Büyüklük"
            value={stats.max_magnitude ? `M${parseFloat(stats.max_magnitude).toFixed(1)}` : '—'}
            pulse={stats.max_magnitude >= 7}
          />
          {kritikSayisi > 0 && (
            <StatCard
              icon={AlertTriangle} iconColor="#ef4444"
              label="Kritik Deprem"
              value={kritikSayisi}
              sub="İstanbul 200km içi"
              pulse
            />
          )}
          {tsunamiSayisi > 0 && (
            <StatCard
              icon={Waves} iconColor="#fbbf24"
              label="Tsunami Uyarısı"
              value={tsunamiSayisi}
              pulse
            />
          )}
        </div>
      )}

      {yukleniyor ? (
        <div className="empty-state">
          <div className="spinner spinner-lg" />
          {t('Sismik Harita verisi yükleniyor...')}
        </div>
      ) : (
        <>
          {/* ── Harita ── */}
          <div className="card" style={{ overflow: 'hidden', height: isMobile ? 280 : 430, padding: 0 }}>
            <MapContainer
              center={[39.0, 35.0]}
              zoom={6}
              scrollWheelZoom
              style={{ height: '100%', width: '100%', background: '#0d1117' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
                maxZoom={19}
              />
              <IstanbulMarker />
              {filtreli.map(d => (
                <DepremCircle
                  key={d.id || `${d.enlem}_${d.boylam}_${d.occurred_at}`}
                  d={d}
                  secili={secili}
                  setSecili={setSecili}
                />
              ))}
              <MapFlyTo deprem={secili} />
            </MapContainer>
          </div>

          {/* ── Liste + Yan Panel ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 290px', gap: 16, alignItems: 'start' }}>

            {/* Deprem Listesi */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                {filtreli.length} deprem gösteriliyor
                {sonGuncelleme && <span style={{ marginLeft: 8 }}>· Güncellendi: {sonGuncelleme}</span>}
              </div>

              {filtreli.length === 0 && (
                <div className="empty-state">{t('Bu filtrede deprem bulunamadı.')}</div>
              )}

              {filtreli.slice(0, 80).map((d, i) => {
                const renk = RISK_COLOR[d.risk_seviyesi] || '#6b7280'
                const isSelected = secili?.id === d.id || (secili?.occurred_at === d.occurred_at && secili?.enlem === d.enlem)
                const isExpanded = expandedId === (d.id || `${d.enlem}_${d.occurred_at}`)
                const cardKey = d.id || `${d.enlem}_${d.boylam}_${i}`
                const expandKey = d.id || `${d.enlem}_${d.occurred_at}`
                const isKritik = d.risk_seviyesi === 'KRITIK'

                return (
                  <div
                    key={cardKey}
                    style={{
                      background: isSelected ? `${renk}0a` : 'var(--bg-card)',
                      border: `1px solid ${isSelected ? renk + '45' : d.tsunami ? '#d9770660' : 'var(--border)'}`,
                      borderRadius: 12,
                      overflow: 'hidden',
                      transition: 'all 0.15s ease',
                      animation: isKritik ? 'pulse-glow 2s ease-in-out infinite' : 'none',
                    }}
                  >
                    {/* Tsunami Banner */}
                    {d.tsunami && (
                      <div style={{
                        background: '#78350f', borderBottom: '1px solid #d97706',
                        padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: '0.72rem', color: '#fbbf24', fontWeight: 700,
                      }}>
                        <Waves size={12} /> 🌊 TSUNAMİ UYARISI
                      </div>
                    )}

                    {/* PAGER Bar */}
                    {d.pager_alert && PAGER_COLOR[d.pager_alert] && (
                      <div style={{
                        background: PAGER_COLOR[d.pager_alert].bg,
                        borderBottom: `1px solid ${PAGER_COLOR[d.pager_alert].border}`,
                        padding: '3px 14px', display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: '0.65rem', color: PAGER_COLOR[d.pager_alert].text, fontWeight: 700,
                      }}>
                        <Shield size={10} /> USGS PAGER · {PAGER_COLOR[d.pager_alert].label} Tehlike
                      </div>
                    )}

                    {/* Ana Kart */}
                    <div
                      style={{ padding: '12px 14px', cursor: 'pointer' }}
                      onClick={() => {
                        setSecili(isSelected ? null : d)
                        if (!isSelected) setExpandedId(null)
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.parentElement.style.borderColor = 'var(--border-light)' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.parentElement.style.borderColor = d.tsunami ? '#d9770660' : 'var(--border)' }}
                    >
                      {/* Satır 1: Büyüklük + Konum + Risk */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
                          {/* Magnitude badge */}
                          <div style={{
                            padding: '4px 11px', borderRadius: 8, flexShrink: 0,
                            background: `${renk}18`, border: `1px solid ${renk}35`,
                            fontSize: '0.9rem', fontWeight: 800, color: renk,
                            display: 'flex', alignItems: 'center', gap: 5,
                          }}>
                            <Activity size={12} />
                            M{d.magnitude > 0 ? d.magnitude.toFixed(1) : '-.-'}
                            {d.magnitude_type && d.magnitude_type !== 'M' && (
                              <span style={{ fontSize: '0.58rem', opacity: 0.7 }}>{d.magnitude_type}</span>
                            )}
                          </div>
                          {/* Konum */}
                          <span style={{ fontSize: '0.82rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.yer}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span className={`badge ${RISK_BADGE_CLASS[d.risk_seviyesi] || 'badge-gray'}`}>
                            {isKritik && <AlertTriangle size={9} />}
                            {d.risk_seviyesi}
                          </span>
                        </div>
                      </div>

                      {/* Satır 2: Meta bilgiler */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} />
                          {d.occurred_at?.slice(5, 19)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Crosshair size={10} />
                          İstanbul {d.istanbula_uzaklik} km
                        </span>
                        <span>{d.derinlik} km ↓</span>

                        {/* Kaynak badge'leri */}
                        {d.source && <SourceBadge source={d.source} />}

                        {/* Hissedilen */}
                        {d.felt_count > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#a78bfa' }}>
                            <Eye size={10} /> {d.felt_count}
                          </span>
                        )}

                        {/* Quality */}
                        <QualityBadge quality={d.quality} />
                      </div>
                    </div>

                    {/* Genişlet butonu */}
                    {isSelected && (
                      <div
                        style={{ borderTop: '1px solid var(--border)', padding: '6px 14px', display: 'flex', justifyContent: 'center', cursor: 'pointer', background: 'var(--bg-elevated)' }}
                        onClick={() => setExpandedId(isExpanded ? null : expandKey)}
                      >
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isExpanded ? <><ChevronUp size={11} /> Kapat</> : <><ChevronDown size={11} /> Detayları Göster</>}
                        </span>
                      </div>
                    )}

                    {/* Detay Paneli */}
                    {isSelected && isExpanded && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', background: 'var(--bg-elevated)' }}>
                        {/* Koordinatlar & Teknik */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                          <span>📍 Enlem: <b style={{ color: 'var(--text)' }}>{d.enlem}</b></span>
                          <span>📍 Boylam: <b style={{ color: 'var(--text)' }}>{d.boylam}</b></span>
                          <span>📏 Derinlik: <b style={{ color: 'var(--text)' }}>{d.derinlik} km</b></span>
                          {d.mmi && <span>📊 MMI: <b style={{ color: 'var(--text)' }}>{d.mmi}</b></span>}
                          {d.sismik_id && <span style={{ gridColumn: '1/-1', fontSize: '0.62rem', opacity: 0.6 }}>ID: {d.sismik_id}</span>}
                          {d.geo_location && <span style={{ gridColumn: '1/-1' }}>🌍 {d.geo_location}</span>}
                        </div>

                        {/* Büyüklük türleri */}
                        <MagnitudeTypes d={d} />

                        {/* Çoklu kaynak tablosu */}
                        {d.sources?.length > 1 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Kaynak Karşılaştırması
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {d.sources.map((s, si) => (
                                <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.7rem' }}>
                                  <SourceBadge source={s.name} />
                                  <span style={{ color: 'var(--text)' }}>M{s.magnitude > 0 ? s.magnitude.toFixed(2) : '-.-'}</span>
                                  <span style={{ color: 'var(--text-muted)' }}>{s.depth_km > 0 ? `${s.depth_km} km` : ''}</span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>{s.quality}</span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem', marginLeft: 'auto' }}>{s.location}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Sağ Yan Panel ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: isMobile ? 'static' : 'sticky', top: 16 }}>

              {/* İstanbul Analizi */}
              <div className="card card-glow" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
                  <MapPin size={14} color="var(--accent)" />
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text)' }}>İstanbul Analizi</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {['KRITIK', 'YUKSEK', 'ORTA'].map(seviye => {
                    const sayi = depremler.filter(d => d.risk_seviyesi === seviye && d.istanbula_uzaklik < 200).length
                    if (sayi === 0 && seviye !== 'KRITIK') return null
                    return (
                      <div key={seviye} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className={`badge ${RISK_BADGE_CLASS[seviye]}`}>{seviye}</span>
                        <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.85rem' }}>{sayi}</span>
                      </div>
                    )
                  })}
                  {kritikSayisi === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', padding: '10px 0' }}>
                      ✓ Şu an kritik risk yok
                    </div>
                  )}
                </div>
              </div>

              {/* Risk Seviyeleri */}
              <div className="card" style={{ padding: 18 }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text)', marginBottom: 12 }}>Risk Seviyeleri</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    { seviye: 'KRITIK',  aciklama: 'M≥5, 200km içi',  renk: '#ef4444' },
                    { seviye: 'YUKSEK',  aciklama: 'M≥4, 150km içi',  renk: '#f97316' },
                    { seviye: 'ORTA',    aciklama: 'M≥3, 100km içi',  renk: '#eab308' },
                    { seviye: 'DIKKAT',  aciklama: 'M≥3, Marmara',    renk: '#06b6d4' },
                    { seviye: 'BILGI',   aciklama: 'Düşük risk',       renk: '#6b7280' },
                  ].map(l => (
                    <div key={l.seviye} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.73rem' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.renk, flexShrink: 0, boxShadow: `0 0 5px ${l.renk}60` }} />
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', width: 65 }}>{l.seviye}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{l.aciklama}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kaynak Özeti */}
              <div className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <Globe size={13} color="var(--text-muted)" />
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text)' }}>Aktif Kaynaklar</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {AVAILABLE_SOURCES.map(s => {
                    const count = depremler.filter(d => d.source?.toLowerCase() === s.id).length
                    if (count === 0) return null
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <SourceBadge source={s.id} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Atıf */}
              <div className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <Radio size={11} color="var(--text-muted)" />
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Veri Kaynağı</span>
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.65, margin: 0 }}>
                  <a
                    href="https://sismikharita.com"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
                  >
                    Sismik Harita
                  </a>
                  {' '}(Evrim Ağacı)<br />
                  Kandilli · AFAD · USGS · EMSC · GFZ · NOA · IRIS<br />
                  <span style={{ fontSize: '0.62rem', opacity: 0.7 }}>Her 30 saniyede güncellenir</span>
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
