import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Monitor, Terminal, Folder, Power, Cpu, Wifi, HardDrive,
  Package, ScrollText, Server, Info, MessageSquare, Shield,
  Menu, X, Container, Clock, LogOut, Activity, Brain, Search,
  AlertTriangle, ShieldOff, Sun, Moon, Settings, Bug, Gauge,
  ChevronRight,
} from 'lucide-react'
import { setToken, api } from '../api'
import { useTheme } from '../context/ThemeContext'
import { useI18n } from '../context/I18nContext'

// ── Nav link groups ────────────────────────────────────────────────────────
const navGroups = [
  {
    label: 'Sistem',
    links: [
      { to: '/',            label: 'Genel Bakış',    icon: Monitor },
      { to: '/system-info', label: 'Sistem Bilgisi', icon: Info },
      { to: '/processes',   label: 'Processler',     icon: Cpu },
      { to: '/services',    label: 'Servisler',      icon: Server },
      { to: '/disk-usage',  label: 'Disk Analizi',   icon: HardDrive },
      { to: '/network',     label: 'Ağ',             icon: Wifi },
    ],
  },
  {
    label: 'Araçlar',
    links: [
      { to: '/terminal',  label: 'Terminal',        icon: Terminal },
      { to: '/files',     label: 'Dosyalar',        icon: Folder },
      { to: '/docker',    label: 'Docker',          icon: Container },
      { to: '/cron',      label: 'Zamanlayıcı',     icon: Clock },
      { to: '/updates',   label: 'Güncellemeler',   icon: Package },
      { to: '/logs',      label: 'Günlükler',       icon: ScrollText },
      { to: '/speedtest', label: 'Hız Testi',       icon: Gauge },
    ],
  },
  {
    label: 'Güvenlik',
    links: [
      { to: '/pentest',   label: 'Pen-Test',        icon: Shield,    accent: 'red' },
      { to: '/firewall',  label: 'Güvenlik Duvarı', icon: ShieldOff, accent: 'red' },
      { to: '/playbooks', label: 'Playbook',        icon: Server },
    ],
  },
  {
    label: 'İstihbarat',
    links: [
      { to: '/search', label: 'Arama',         icon: Search,   accent: 'purple' },
      { to: '/deprem', label: 'Deprem İzleme', icon: Activity, accent: 'orange' },
    ],
  },
  {
    label: 'AI & Sohbet',
    links: [
      { to: '/ai',   label: 'AI Asistan', icon: Brain,          accent: 'purple' },
      { to: '/chat', label: 'Asistan',    icon: MessageSquare },
    ],
  },
  {
    label: 'Diğer',
    links: [
      { to: '/power',   label: 'Güç Yönetimi', icon: Power },
      { to: '/windows', label: 'Windows',      icon: Monitor },
    ],
  },
]

const accentColors = {
  red:    { color: '#f87171', bg: 'rgba(239,68,68,0.08)',    border: 'rgba(239,68,68,0.2)' },
  purple: { color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
  orange: { color: '#fb923c', bg: 'rgba(249,115,22,0.08)',  border: 'rgba(249,115,22,0.2)' },
}

export default function Layout({ children }) {
  const [open, setOpen] = useState(false)
  const [emergency, setEmergency] = useState(false)
  const location = useLocation()
  const { theme, toggle } = useTheme()
  const { t } = useI18n()

  useEffect(() => { setOpen(false) }, [location.pathname])

  useEffect(() => {
    const check = async () => {
      try { const d = await api('/api/ollama/emergency'); setEmergency(d.emergency) } catch {}
    }
    check()
    const id = setInterval(check, 10000)
    return () => clearInterval(id)
  }, [])

  const toggleEmergency = async () => {
    try {
      const d = await api('/api/ollama/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergency: !emergency }),
      })
      setEmergency(d.emergency)
    } catch {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>
      <style>{`
        .nav-link {
          display: flex; align-items: center; gap: 9px;
          padding: 7px 10px; border-radius: 9px;
          font-size: 0.8rem; font-weight: 500;
          color: var(--text-secondary);
          text-decoration: none;
          transition: all 0.15s ease;
          position: relative;
          border: 1px solid transparent;
        }
        .nav-link:hover {
          background: var(--bg-hover);
          color: var(--text);
        }
        .nav-link.active {
          background: var(--accent-glow);
          color: var(--accent);
          border-color: rgba(6,182,212,0.2);
        }
        .nav-link.active::before {
          content: '';
          position: absolute;
          left: -1px; top: 25%; bottom: 25%;
          width: 3px;
          background: var(--accent);
          border-radius: 0 3px 3px 0;
          box-shadow: 0 0 8px var(--accent);
        }
        .nav-link.accent-red { color: rgba(248,113,113,0.7); }
        .nav-link.accent-red:hover { background: rgba(239,68,68,0.08); color: #f87171; border-color: rgba(239,68,68,0.15); }
        .nav-link.accent-red.active { background: rgba(239,68,68,0.1); color: #f87171; border-color: rgba(239,68,68,0.25); }
        .nav-link.accent-red.active::before { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
        .nav-link.accent-purple { color: rgba(167,139,250,0.7); }
        .nav-link.accent-purple:hover { background: rgba(167,139,250,0.08); color: #a78bfa; border-color: rgba(167,139,250,0.15); }
        .nav-link.accent-purple.active { background: rgba(167,139,250,0.1); color: #a78bfa; border-color: rgba(167,139,250,0.25); }
        .nav-link.accent-purple.active::before { background: #a78bfa; box-shadow: 0 0 8px #a78bfa; }
        .nav-link.accent-orange { color: rgba(251,146,60,0.7); }
        .nav-link.accent-orange:hover { background: rgba(249,115,22,0.08); color: #fb923c; border-color: rgba(249,115,22,0.15); }
        .nav-link.accent-orange.active { background: rgba(249,115,22,0.1); color: #fb923c; border-color: rgba(249,115,22,0.25); }
        .nav-link.accent-orange.active::before { background: #f97316; box-shadow: 0 0 8px #f97316; }
      `}</style>

      {/* Emergency Banner */}
      {emergency && (
        <div style={{
          flexShrink: 0,
          background: 'rgba(239,68,68,0.9)',
          backdropFilter: 'blur(8px)',
          color: '#fff',
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          fontSize: '0.825rem', fontWeight: 700,
          borderBottom: '1px solid rgba(239,68,68,0.5)',
          zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} style={{ animation: 'blink 1s ease-in-out infinite' }} />
            {t('ACİL DURUM MODU AKTİF — Asistan hayatta kalma moduna geçti')}
          </div>
          <button onClick={toggleEmergency} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 7,
            background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', fontSize: '0.75rem', cursor: 'pointer',
            transition: 'background 0.15s',
          }}>
            <ShieldOff size={13} /> {t('Devre Dışı Bırak')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Overlay */}
        {open && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 999, backdropFilter: 'blur(2px)' }}
            onClick={() => setOpen(false)}
          />
        )}

        {/* Sidebar */}
        <nav style={{
          position: 'fixed', top: emergency ? 42 : 0, bottom: 0,
          left: 0, width: 230,
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
          zIndex: 1000,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.2s ease',
        }}
          className="lg-sidebar"
        >
          <style>{`
            @media (min-width: 1024px) {
              .lg-sidebar { transform: translateX(0) !important; position: relative !important; top: 0 !important; }
            }
          `}</style>

          {/* Logo */}
          <div style={{
            padding: '18px 16px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: 'linear-gradient(135deg, var(--accent), #0e7490)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 14px rgba(6,182,212,0.35)',
                flexShrink: 0,
              }}>
                <Monitor size={16} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)', letterSpacing: '-0.02em' }}>
                  PC Manager
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>
                  v1.3.0
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="btn-ghost"
              style={{ padding: 4, display: 'flex' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Nav groups */}
          <div style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
            {navGroups.map((group) => (
              <div key={group.label} style={{ marginBottom: 6 }}>
                <div className="section-label" style={{ marginBottom: 4, marginTop: 8, paddingLeft: 10 }}>
                  {t(group.label)}
                </div>
                {group.links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/'}
                    className={({ isActive }) =>
                      `nav-link${isActive ? ' active' : ''}${link.accent ? ` accent-${link.accent}` : ''}`
                    }
                  >
                    <link.icon size={15} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{t(link.label)}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </div>

          {/* Bottom actions */}
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '8px 10px',
            flexShrink: 0,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Settings size={15} /> {t('Ayarlar')}
            </NavLink>
            <NavLink to="/debug" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Bug size={15} /> {t('Debug')}
            </NavLink>
            <div style={{ height: 4 }} />
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={toggle} className="btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                <span>{theme === 'dark' ? t('Aydınlık') : t('Karanlık')}</span>
              </button>
              <button
                onClick={() => { setToken(null); window.location.href = '/login' }}
                className="btn-ghost"
                data-tooltip="Çıkış Yap"
                style={{ color: 'var(--text-muted)' }}
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, marginLeft: 0 }}
          className="main-content"
        >
          <style>{`
            @media (min-width: 1024px) {
              .main-content { margin-left: 230px !important; }
            }
          `}</style>

          {/* Mobile topbar */}
          <header style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: 'color-mix(in srgb, var(--bg-secondary) 90%, transparent)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--border)',
            padding: '0 16px',
            height: 52,
            display: 'flex', alignItems: 'center', gap: 12,
          }} className="mobile-header">
            <style>{`@media (min-width: 1024px) { .mobile-header { display: none !important; } }`}</style>
            <button onClick={() => setOpen(true)} className="btn-ghost" style={{ padding: 6 }}>
              <Menu size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7,
                background: 'linear-gradient(135deg, var(--accent), #0e7490)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Monitor size={13} color="#fff" />
              </div>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>PC Manager</span>
            </div>
          </header>

          <main style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }} className="main-pad">
            <style>{`@media (min-width: 768px) { .main-pad { padding: 28px 28px !important; } }`}</style>
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
