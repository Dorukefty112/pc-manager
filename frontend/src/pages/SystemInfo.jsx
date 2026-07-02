import { useState, useEffect } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Monitor, Cpu, HardDrive, Users, Clock, CircuitBoard, Server } from 'lucide-react'

const iconMap = { Monitor, Cpu, HardDrive, Users, Clock, CircuitBoard, Server }

export default function SystemInfo() {
  const { t } = useI18n()
  const [info, setInfo] = useState(null)

  useEffect(() => {
    api('/api/system/info').then(setInfo).catch(() => {})
  }, [])

  const fmtBytes = (b) => {
    if (!b) return '0'
    if (b > 1e12) return `${(b / 1e12).toFixed(2)} TB`
    if (b > 1e9)  return `${(b / 1e9).toFixed(2)} GB`
    return `${(b / 1e6).toFixed(0)} MB`
  }

  if (!info) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240, flexDirection: 'column', gap: 12 }}>
      <div className="spinner spinner-lg" />
      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('Yükleniyor...')}</span>
    </div>
  )

  const rows = [
    { label: 'Hostname',          value: info.hostname,   icon: Monitor,      color: '#06b6d4' },
    { label: t('İşletim Sistemi'), value: info.os,         icon: Monitor,      color: '#06b6d4' },
    { label: 'Kernel',            value: info.kernel,     icon: CircuitBoard, color: '#a78bfa' },
    { label: t('Mimari'),          value: info.arch,       icon: CircuitBoard, color: '#a78bfa' },
    { label: t('Açık Kalma'),      value: `${info.uptime_days} ${t('gün')}`, icon: Clock, color: '#fb923c' },
    { label: t('Çekirdekler'),     value: `${info.cpu.physical_cores} ${t('fiziksel')} / ${info.cpu.logical_cores} ${t('mantıksal')}`, icon: Cpu, color: '#34d399' },
    { label: t('CPU Modeli'),      value: info.cpu.brand,  icon: Cpu,          color: '#34d399' },
    { label: t('Max Frekans'),     value: info.cpu.max_freq ? `${info.cpu.max_freq.toFixed(0)} MHz` : '-', icon: Cpu, color: '#34d399' },
    { label: t('Toplam RAM'),      value: fmtBytes(info.memory.total),      icon: HardDrive, color: '#f59e0b' },
    { label: t('Swap'),            value: fmtBytes(info.memory.swap_total), icon: HardDrive, color: '#f59e0b' },
    { label: t('Kullanıcılar'),    value: info.users?.join(', ') || '-',    icon: Users,     color: '#ec4899' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Server size={18} color="var(--accent)" /></span>
          {t('Sistem Bilgileri')}
        </h2>
      </div>

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {rows.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card card-glow" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: `${color}18`, border: `1px solid ${color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={18} color={color} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 3 }}>
                {label}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Disk partitions */}
      {info.disks?.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <HardDrive size={15} color="var(--accent)" />
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' }}>{t('Disk Bölümleri')}</span>
          </div>
          <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {info.disks.filter(Boolean).map((d, i) => {
              const diskColor = d.percent > 80 ? '#ef4444' : d.percent > 60 ? '#f97316' : '#34d399'
              return (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>
                      {d.device}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{d.mount} · {d.fstype}</span>
                      <span className="badge" style={{
                        background: `${diskColor}15`, color: diskColor, border: `1px solid ${diskColor}30`,
                        fontSize: '0.68rem',
                      }}>{d.percent.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                    {fmtBytes(d.used)} / {fmtBytes(d.total)}
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99, width: `${Math.min(d.percent, 100)}%`,
                      background: diskColor, boxShadow: `0 0 8px ${diskColor}60`,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
