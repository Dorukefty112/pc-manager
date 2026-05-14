import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Monitor, Terminal, Folder, Power, Cpu, Wifi, HardDrive, Package, ScrollText, Server, Info, MessageSquare, Shield, Menu, X, Container, Clock, LogOut, Activity, Brain, Settings, Bug, Search, AlertTriangle, ShieldOff } from 'lucide-react'
import { setToken, api } from '../api'

const links = [
  { to: '/', label: 'Dashboard', icon: Monitor },
  { to: '/search', label: 'Arama', icon: Search, highlight: true },
  { to: '/chat', label: 'Asistan', icon: MessageSquare },
  { to: '/terminal', label: 'Terminal', icon: Terminal },
  { to: '/pentest', label: 'Pen-Test', icon: Shield, highlight: true },
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
]

export default function Layout({ children }) {
  const [open, setOpen] = useState(false)
  const [emergency, setEmergency] = useState(false)
  const location = useLocation()

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
    <div className="flex h-screen">
      {emergency && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-700/90 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm font-bold animate-pulse backdrop-blur">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="animate-bounce" />
            <span>ACİL DURUM MODU AKTİF — Asistan hayatta kalma moduna geçti</span>
          </div>
          <button onClick={toggleEmergency}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-900/50 hover:bg-red-800 text-white text-xs transition-colors whitespace-nowrap">
            <ShieldOff size={14} />
            Devre Dışı Bırak
          </button>
        </div>
      )}
      {emergency && <div className="fixed inset-0 z-40 pointer-events-none bg-red-900/5" />}
      {open && <div className="fixed inset-0 bg-black/60 z-[1000] lg:hidden" onClick={() => setOpen(false)} />}

      <nav className={`
        fixed lg:relative z-[1001] h-full w-64 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto shrink-0
        transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between px-4 py-5 shrink-0">
          <h1 className="text-lg font-bold text-cyan-400">PC Manager</h1>
          <button onClick={() => setOpen(false)} className="lg:hidden p-1 text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 px-2 pb-4 space-y-0.5">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? (l.highlight ? 'bg-red-600/20 text-red-300' : 'bg-cyan-600/15 text-cyan-300') : l.highlight ? 'text-red-400/70 hover:bg-red-900/20 hover:text-red-300' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'} font-medium`
              }>
              <l.icon size={16} className="shrink-0" />
              <span className="truncate">{l.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="border-t border-gray-800 px-2 py-1.5 space-y-0.5">
          <NavLink to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? 'bg-cyan-600/15 text-cyan-300' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'} font-medium`
            }>
            <Settings size={16} />
            <span>Ayarlar</span>
          </NavLink>
          <a href="/debug"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-800 hover:text-gray-300 font-medium transition-colors">
            <Bug size={16} />
            <span>Debug</span>
          </a>
        </div>
        <div className="border-t border-gray-800 px-2 py-3">
          <button onClick={() => { setToken(null); window.location.href = '/login' }}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-red-900/10 transition-colors">
            <LogOut size={16} />
            <span>Cikis Yap</span>
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col min-w-0">
        <header className={`sticky z-10 bg-gray-950/90 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center gap-3 lg:hidden ${emergency ? 'top-10' : 'top-0'}`}>
          <button onClick={() => setOpen(true)} className="p-1 text-gray-400 hover:text-white"><Menu size={22} /></button>
          <h1 className="text-base font-bold text-cyan-400">PC Manager</h1>
        </header>
        <main className={`flex-1 overflow-auto p-3 sm:p-4 lg:p-6 ${emergency ? 'pt-14' : ''}`}>{children}</main>
      </div>
    </div>
  )
}
