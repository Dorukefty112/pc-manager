import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import DebugOverlay from './components/DebugOverlay'
import Dashboard from './pages/Dashboard'
import Terminal from './pages/Terminal'
import Files from './pages/Files'
import Power from './pages/Power'
import Chat from './pages/Chat'
import Processes from './pages/Processes'
import Network from './pages/Network'
import SystemInfo from './pages/SystemInfo'
import DiskUsage from './pages/DiskUsage'
import Updates from './pages/Updates'
import Logs from './pages/Logs'
import Services from './pages/Services'
import PenTest from './pages/PenTest'
import Docker from './pages/Docker'
import Cron from './pages/Cron'
import Windows from './pages/Windows'
import Settings from './pages/Settings'
import Debug from './pages/Debug'
import DepremUyari from './pages/DepremUyari'
import OrmanYanginIzleme from './pages/OrmanYanginIzleme'
import SelIzleme from './pages/SelIzleme'
import HavaUyari from './pages/HavaUyari'
import DepremAlert from './components/DepremAlert'
import OllamaChat from './pages/OllamaChat'
import SearchEngine from './pages/SearchEngine'
import Speedtest from './pages/Speedtest'
import Firewall from './pages/Firewall'
import Temperature from './pages/Temperature'
import Playbooks from './pages/Playbooks'
import Login from './pages/Login'
import Setup from './pages/Setup'
import MobilePairing from './pages/MobilePairing'
import { useI18n } from './context/I18nContext'
import { isAuthenticated, getServerBase, setServerBase, setToken } from './api'
import { useState, useEffect } from 'react'
import { api } from './api'
import { Capacitor } from '@capacitor/core'

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return children
}

function SetupGuard({ children }) {
  const { t } = useI18n()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const checkSetup = () => {
    setStatus('loading')
    setError(null)
    api('/api/setup', { timeout: 6000 })
      .then(d => setStatus(d.completed ? 'done' : 'setup'))
      .catch((err) => {
        if (Capacitor.isNativePlatform()) {
          setError(err.message || 'Sunucuya bağlanılamadı')
          setStatus('error')
        } else {
          setStatus('done')
        }
      })
  }

  useEffect(() => {
    checkSetup()
  }, [])

  if (status === 'loading') {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg-primary)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3, marginBottom: 16 }} />
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t("Sunucuya bağlanılıyor...")}</div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg-primary)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 360, padding: 28, textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--red)', margin: '0 0 8px' }}>Bağlantı Hatası</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 20px', wordBreak: 'break-word' }}>{error}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={checkSetup} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Yeniden Dene
            </button>
            <button
              onClick={() => {
                setServerBase(null)
                setToken(null)
                window.location.reload()
              }}
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Yeniden Eşleştir
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'setup') return <Setup />
  return children
}

export default function App() {
  if (Capacitor.isNativePlatform() && !getServerBase()) {
    return <MobilePairing />
  }

  return (
    <>
      <DepremAlert />
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={isAuthenticated() ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/*" element={
          <SetupGuard>
            <ProtectedRoute>
              <Layout>
              <Routes>
                <Route path="/" element={<Temperature />} />
                <Route path="/terminal" element={<Terminal />} />
                <Route path="/files/*" element={<Files />} />
                <Route path="/power" element={<Power />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/pentest" element={<PenTest />} />
                <Route path="/processes" element={<Processes />} />
                <Route path="/network" element={<Network />} />
                <Route path="/system-info" element={<SystemInfo />} />
                <Route path="/disk-usage" element={<DiskUsage />} />
                <Route path="/updates" element={<Updates />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/services" element={<Services />} />
                <Route path="/docker" element={<Docker />} />
                <Route path="/cron" element={<Cron />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/debug" element={<Debug />} />
                <Route path="/deprem" element={<DepremUyari />} />
                <Route path="/yangin" element={<OrmanYanginIzleme />} />
                <Route path="/sel" element={<SelIzleme />} />
                <Route path="/hava-uyari" element={<HavaUyari />} />
                <Route path="/windows" element={<Windows />} />
                <Route path="/search" element={<SearchEngine />} />
                <Route path="/speedtest" element={<Speedtest />} />
                <Route path="/firewall" element={<Firewall />} />
                <Route path="/temperature" element={<Temperature />} />
                <Route path="/playbooks" element={<Playbooks />} />
                <Route path="/ai" element={<OllamaChat />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
              <DebugOverlay />
            </Layout>
          </ProtectedRoute>
          </SetupGuard>
        } />
      </Routes>
    </>
  )
}
