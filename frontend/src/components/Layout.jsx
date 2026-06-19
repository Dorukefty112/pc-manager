import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Monitor, Terminal, Folder, Power, Cpu, Wifi, HardDrive, Package, ScrollText, Server, Info, MessageSquare, Shield, Menu, X, Container, Clock, LogOut, Activity, Brain, Search, AlertTriangle, ShieldOff, Sun, Moon, Settings, Bug, Gauge } from 'lucide-react'
import { setToken, api } from '../api'
import { useTheme } from '../context/ThemeContext'
import { useI18n } from '../context/I18nContext'

const links = [
  { to: '/', label: 'Sistem Durumu', icon: Monitor },
  { to: '/search', label: 'Arama', icon: Search, highlight: true },
  { to: '/chat', label: 'Asistan', icon: MessageSquare },
  { to: '/terminal', label: 'Terminal', icon: Terminal },
  { to: '/files', label: 'Dosyalar', icon: Folder },
  { to: '/processes', label: 'Processler', icon: Cpu },
  { to: '/services', label: 'Servisler', icon: Server },
  { to: '/docker', label: 'Docker', icon: Container },
  { to: '/cron', label: 'Zamanlayici', icon: Clock },
  { to: '/network', label: 'Ag', icon: Wifi },
  { to: '/disk-usage', label: 'Disk Analizi', icon: HardDrive },
  { to: '/system-info', label: 'Sistem Bilgi', icon: Info },
  { to: '/updates', label: 'Guncellemeler', icon: Package },
  { to: '/logs', label: 'Gunlukler', icon: ScrollText },
  { to: '/ai', label: 'AI Asistan', icon: Brain, highlight: true },
  { to: '/deprem', label: 'Deprem', icon: Activity, highlight: true },
  { to: '/power', label: 'Guc', icon: Power },
  { to: '/pentest', label: 'Pen-Test', icon: Shield, highlight: true },
  { to: '/speedtest', label: 'Hiz Testi', icon: Gauge },
  { to: '/firewall', label: 'Guvenlik Duvar', icon: ShieldOff },
  { to: '/windows', label: 'Windows', icon: Monitor, highlight: false },
  { to: '/playbooks', label: 'Playbook', icon: Server },
]

export default function Layout({ children }) {
  const [open, setOpen] = useState(false)
  const [emergency, setEmergency] = useState(false)
  const location = useLocation()
  const { theme, toggle } = useTheme()
  const { t } = useI18n()

  useEffect(() => { setOpen(false) }, [location.pathname])

  useEffect(() => {
    const check = async () => {
      try {
        const data = await api('/api/ollama/emergency')
        setEmergency(data.emergency)
      } catch {}
    }
    check()
    const id = setInterval(check, 10000)
    return () => clearInterval(id)
  }, [])

  const toggleEmergency = async () => {
    try {
      const data = await api('/api/ollama/emergency', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({emergency: !emergency}),
      })
      setEmergency(data.emergency)
    } catch {}
  }

  return (
    <div className="flex flex-col h-screen" style={{background: 'var(--bg-primary)'}}>
      {emergency && (
        <div className="shrink-0 relative z-50 bg-red-700/90 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm font-bold animate-pulse backdrop-blur">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="animate-bounce" />
            <span>{t("ACİL DURUM MODU AKTİF — Asistan hayatta kalma moduna geçti")}</span>
          </div>
          <button onClick={toggleEmergency}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-900/50 hover:bg-red-800 text-white text-xs transition-colors whitespace-nowrap">
            <ShieldOff size={14} />
            {t("Devre Dışı Bırak")}
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {open && <div className="fixed inset-0 bg-black/60 z-[1000] lg:hidden" onClick={() => setOpen(false)} />}

        <nav style={{background: 'var(--bg-secondary)', borderColor: 'var(--border)'}}
          className={`fixed lg:relative z-[1001] h-full w-64 border-r flex flex-col overflow-y-auto shrink-0 transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="flex items-center justify-between px-4 py-5 shrink-0">
            <h1 className="text-lg font-bold" style={{color: 'var(--accent)'}}>PC Manager</h1>
            <button onClick={() => setOpen(false)} className="lg:hidden p-1" style={{color: 'var(--text-muted)'}}><X size={20} /></button>
          </div>

          <div className="flex-1 px-2 pb-4 space-y-0.5">
            {links.map(l => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? l.highlight ? 'bg-red-600/20 text-red-300' : 'text-cyan-300'
                      : l.highlight ? 'text-red-400/70 hover:bg-red-900/20 hover:text-red-300' : 'hover:bg-gray-800'
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive && !l.highlight ? 'var(--accent)' : undefined,
                  background: isActive && !l.highlight ? 'var(--accent-glow)' : undefined,
                })}>
                <l.icon size={16} className="shrink-0" />
                <span className="truncate">{t(l.label)}</span>
              </NavLink>
            ))}
          </div>

          <div className="border-t px-2 py-1.5 space-y-0.5" style={{borderColor: 'var(--border)'}}>
            <NavLink to="/settings"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'text-cyan-300' : 'hover:bg-gray-800'}`
              }
              style={({ isActive }) => ({
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                background: isActive ? 'var(--accent-glow)' : undefined,
              })}>
              <Settings size={16} />
              <span>{t("Ayarlar")}</span>
            </NavLink>
            <NavLink to="/debug"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'text-cyan-300' : 'hover:bg-gray-800'}`
              }
              style={({ isActive }) => ({
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                background: isActive ? 'var(--accent-glow)' : undefined,
              })}>
              <Bug size={16} />
              <span>{t("Debug")}</span>
            </NavLink>
          </div>

          <div className="border-t px-2 py-3 flex items-center gap-1" style={{borderColor: 'var(--border)'}}>
            <button onClick={toggle}
              className="btn-ghost flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm flex-1 justify-center">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span style={{color: 'var(--text-muted)'}}>{theme === 'dark' ? t("Aydınlık") : t("Karanlık")}</span>
            </button>
            <button onClick={() => { setToken(null); window.location.href = '/login' }}
              className="btn-ghost flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm"
              style={{color: 'var(--text-muted)'}}>
              <LogOut size={16} />
            </button>
          </div>
        </nav>

        <div className="flex-1 flex flex-col min-w-0">
          <header style={{background: 'color-mix(in srgb, var(--bg-primary) 85%, transparent)', borderColor: 'var(--border)'}}
            className="sticky top-0 z-10 backdrop-blur border-b px-4 py-3 flex items-center gap-3 lg:hidden">
            <button onClick={() => setOpen(true)} className="p-1" style={{color: 'var(--text-muted)'}}><Menu size={22} /></button>
            <h1 className="text-base font-bold" style={{color: 'var(--accent)'}}>PC Manager</h1>
          </header>
          <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
