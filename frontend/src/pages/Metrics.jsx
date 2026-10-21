import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { PageHeader, Tabs, Notice, EmptyState, fmtBytes } from '../components/ui'
import { LineChart, RefreshCw, Table2 } from 'lucide-react'

// Seri renkleri: doğrulanmış kategorik palet (açık/koyu tema için ayrı adımlar)
const VIZ_CSS = `
.viz-root { --series-1: #3987e5; --series-2: #d95926; --grid: rgba(148,163,184,0.12); --crosshair: rgba(148,163,184,0.5); }
.light .viz-root { --series-1: #2a78d6; --series-2: #eb6834; --grid: rgba(15,23,42,0.08); --crosshair: rgba(15,23,42,0.35); }
.viz-tooltip { position: absolute; pointer-events: none; z-index: 5; background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 8px; padding: 6px 9px; font-size: 0.72rem; color: var(--text); box-shadow: var(--shadow-md); white-space: nowrap; }
.viz-swatch { display: inline-block; width: 10px; height: 3px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
`

const RANGES = [
  { value: '1h', label: '1 saat' },
  { value: '6h', label: '6 saat' },
  { value: '24h', label: '24 saat' },
  { value: '7d', label: '7 gün' },
]

const pct = v => `%${v.toFixed(1)}`
const rate = v => `${fmtBytes(v)}/s`

const CHARTS = [
  { id: 'cpu', title: 'CPU', series: [{ key: 'cpu', label: 'Ortalama' }], fmt: pct, tick: v => `%${Math.round(v)}`, max: 100, extra: p => p.cpu_max != null && `Tepe: ${pct(p.cpu_max)}` },
  { id: 'mem', title: 'RAM', series: [{ key: 'mem', label: 'RAM' }], fmt: pct, tick: v => `%${Math.round(v)}`, max: 100, extra: p => p.swap != null && `Swap: ${pct(p.swap)}` },
  { id: 'disk', title: 'Kök Disk Doluluğu', series: [{ key: 'disk', label: 'Disk' }], fmt: pct, tick: v => `%${Math.round(v)}`, max: 100 },
  { id: 'net', title: 'Ağ Trafiği', series: [{ key: 'net_rx', label: 'Alınan' }, { key: 'net_tx', label: 'Gönderilen' }], fmt: rate },
  { id: 'io', title: 'Disk G/Ç', series: [{ key: 'disk_read', label: 'Okuma' }, { key: 'disk_write', label: 'Yazma' }], fmt: rate },
  { id: 'temp', title: 'Sıcaklık (en sıcak sensör)', series: [{ key: 'temp', label: 'Sıcaklık' }], fmt: v => `${v.toFixed(1)}°C` },
  { id: 'load', title: 'Yük Ortalaması (1 dk)', series: [{ key: 'load1', label: 'Load' }], fmt: v => v.toFixed(2) },
]

function niceMax(v) {
  if (!v || v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / exp
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp
}

function fmtTime(t, range) {
  const d = new Date(t * 1000)
  if (range === '7d') return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

// Boşlukları (sunucu kapalıyken / sensör yokken) çizgiyi koparak gösterir
function buildPath(points, key, x, y, gap) {
  let d = ''
  let prevT = null
  for (const p of points) {
    const v = p[key]
    if (v == null) { prevT = null; continue }
    const cmd = prevT == null || p.t - prevT > gap ? 'M' : 'L'
    d += `${cmd}${x(p.t).toFixed(1)},${y(v).toFixed(1)}`
    prevT = p.t
  }
  return d
}

function ChartCard({ chart, data, hoverT, setHoverT, range }) {
  const { t } = useI18n()
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(600)
  const H = 150, M = { top: 10, right: 12, bottom: 22, left: 52 }

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { points, start, end, bucket } = data
  const hasData = points.some(p => chart.series.some(s => p[s.key] != null))
  const yMax = chart.max ?? niceMax(Math.max(0, ...points.flatMap(p => chart.series.map(s => p[s.key] ?? 0))))
  const innerW = width - M.left - M.right
  const innerH = H - M.top - M.bottom
  const x = tt => M.left + ((tt - start) / (end - start)) * innerW
  const y = v => M.top + innerH - (Math.min(v, yMax) / yMax) * innerH
  const ticks = [0, yMax / 2, yMax]
  const xTicks = [start, start + (end - start) / 2, end]

  const hoverPoint = useMemo(() => {
    if (hoverT == null || !points.length) return null
    let best = null
    for (const p of points) if (!best || Math.abs(p.t - hoverT) < Math.abs(best.t - hoverT)) best = p
    return best && Math.abs(best.t - hoverT) <= bucket * 2 ? best : null
  }, [hoverT, points, bucket])

  const onMove = e => {
    if (!e) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    if (px < M.left || px > width - M.right) return setHoverT(null)
    setHoverT(start + ((px - M.left) / innerW) * (end - start))
  }

  const last = [...points].reverse()
  const multi = chart.series.length > 1

  return (
    <div className="card" style={{ padding: '14px 14px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text)' }}>{t(chart.title)}</div>
        {multi && (
          <div style={{ display: 'flex', gap: 12, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            {chart.series.map((s, i) => (
              <span key={s.key}><span className="viz-swatch" style={{ background: `var(--series-${i + 1})` }} />{t(s.label)}</span>
            ))}
          </div>
        )}
      </div>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        {!hasData ? (
          <EmptyState>{t('Bu aralıkta veri yok')}</EmptyState>
        ) : (
          <svg width={width} height={H} onMouseMove={onMove} onMouseLeave={() => setHoverT(null)}
            onTouchMove={e => onMove(e.touches[0] && { clientX: e.touches[0].clientX, currentTarget: e.currentTarget })}
            style={{ display: 'block', touchAction: 'pan-y' }} role="img" aria-label={t(chart.title)}>
            {ticks.map(v => (
              <g key={v}>
                <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
                <text x={M.left - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--text-muted)">{(chart.tick || chart.fmt)(v)}</text>
              </g>
            ))}
            {xTicks.map((v, i) => (
              <text key={i} x={x(v)} y={H - 6} fontSize="10" fill="var(--text-muted)"
                textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{fmtTime(v, range)}</text>
            ))}
            {chart.series.map((s, i) => (
              <path key={s.key} d={buildPath(points, s.key, x, y, bucket * 3)} fill="none"
                stroke={`var(--series-${i + 1})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {/* çoklu seride son değerin yanına doğrudan etiket */}
            {multi && chart.series.map((s, i) => {
              const lp = last.find(p => p[s.key] != null)
              return lp && <circle key={s.key} cx={x(lp.t)} cy={y(lp[s.key])} r="3" fill={`var(--series-${i + 1})`} stroke="var(--bg-card)" strokeWidth="2" />
            })}
            {hoverPoint && (
              <g>
                <line x1={x(hoverPoint.t)} x2={x(hoverPoint.t)} y1={M.top} y2={M.top + innerH} stroke="var(--crosshair)" strokeDasharray="3 3" />
                {chart.series.map((s, i) => hoverPoint[s.key] != null && (
                  <circle key={s.key} cx={x(hoverPoint.t)} cy={y(hoverPoint[s.key])} r="4"
                    fill={`var(--series-${i + 1})`} stroke="var(--bg-card)" strokeWidth="2" />
                ))}
              </g>
            )}
          </svg>
        )}
        {hasData && hoverPoint && (
          <div className="viz-tooltip" style={{
            top: 4,
            left: Math.min(Math.max(x(hoverPoint.t) + 10, M.left), width - 170),
          }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: 3 }}>{fmtTime(hoverPoint.t, range)}</div>
            {chart.series.map((s, i) => (
              <div key={s.key}>
                <span className="viz-swatch" style={{ background: `var(--series-${i + 1})` }} />
                {t(s.label)}: <strong>{hoverPoint[s.key] != null ? chart.fmt(hoverPoint[s.key]) : '—'}</strong>
              </div>
            ))}
            {chart.extra && chart.extra(hoverPoint) && <div style={{ color: 'var(--text-secondary)' }}>{chart.extra(hoverPoint)}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function DataTable({ data, range }) {
  const { t } = useI18n()
  const rows = [...data.points].reverse().slice(0, 200)
  return (
    <div className="card table-wrap" style={{ maxHeight: 480, overflow: 'auto' }}>
      <table>
        <thead><tr>
          <th>{t('Zaman')}</th><th>CPU</th><th>{t('CPU tepe')}</th><th>RAM</th><th>Disk</th>
          <th>{t('Alınan')}</th><th>{t('Gönderilen')}</th><th>{t('Sıcaklık')}</th><th>Load</th>
        </tr></thead>
        <tbody>{rows.map(p => (
          <tr key={p.t}>
            <td className="mono">{fmtTime(p.t, range === '1h' ? '7d' : range)}</td>
            <td className="mono">{p.cpu != null ? pct(p.cpu) : '—'}</td>
            <td className="mono">{p.cpu_max != null ? pct(p.cpu_max) : '—'}</td>
            <td className="mono">{p.mem != null ? pct(p.mem) : '—'}</td>
            <td className="mono">{p.disk != null ? pct(p.disk) : '—'}</td>
            <td className="mono">{p.net_rx != null ? rate(p.net_rx) : '—'}</td>
            <td className="mono">{p.net_tx != null ? rate(p.net_tx) : '—'}</td>
            <td className="mono">{p.temp != null ? `${p.temp.toFixed(1)}°C` : '—'}</td>
            <td className="mono">{p.load1 != null ? p.load1.toFixed(2) : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export default function Metrics() {
  const { t } = useI18n()
  const [range, setRange] = useState(() => {
    try { return localStorage.getItem('pcmanager_metrics_range') || '1h' } catch { return '1h' }
  })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [hoverT, setHoverT] = useState(null)
  const [table, setTable] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/metrics/history?range=${range}`, { timeout: 15000 }))
      setError('')
    } catch (e) { setError(e.message) }
  }, [range])

  useEffect(() => {
    try { localStorage.setItem('pcmanager_metrics_range', range) } catch {}
    load()
    const id = setInterval(load, range === '1h' ? 15000 : 60000)
    return () => clearInterval(id)
  }, [range, load])

  return (
    <div className="viz-root animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{VIZ_CSS}</style>
      <PageHeader icon={LineChart} title={t('Metrik Geçmişi')}>
        <button className={`btn ${table ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTable(v => !v)}><Table2 size={14} /> {t('Tablo')}</button>
        <button className="btn btn-secondary" onClick={load}><RefreshCw size={14} /> {t('Yenile')}</button>
      </PageHeader>
      <Tabs tabs={RANGES.map(r => ({ ...r, label: t(r.label) }))} value={range} onChange={setRange} />
      <Notice onClose={() => setError('')}>{error}</Notice>
      {data && !data.points.length && (
        <EmptyState>{t('Henüz örnek toplanmadı. Örnekleyici her 10 saniyede bir ölçüm kaydeder; birkaç dakika içinde grafikler dolmaya başlar. Geçmiş 7 gün saklanır.')}</EmptyState>
      )}
      {data && data.points.length > 0 && (table ? <DataTable data={data} range={range} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 14 }}>
          {CHARTS.map(c => <ChartCard key={c.id} chart={c} data={data} hoverT={hoverT} setHoverT={setHoverT} range={range} />)}
        </div>
      ))}
    </div>
  )
}
