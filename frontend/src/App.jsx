import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import DebugOverlay from './components/DebugOverlay'
import DepremAlert from './components/DepremAlert'
import Login from './pages/Login'
import Setup from './pages/Setup'
import MobilePairing from './pages/MobilePairing'
import { useI18n } from './context/I18nContext'
import { isAuthenticated, getServerBase, setServerBase, setToken } from './api'
import { useState, useEffect, lazy, Suspense } from 'react'
import { api } from './api'
import { Capacitor } from '@capacitor/core'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Terminal = lazy(() => import('./pages/Terminal'))
const Files = lazy(() => import('./pages/Files'))
const Power = lazy(() => import('./pages/Power'))
const Chat = lazy(() => import('./pages/Chat'))
const Processes = lazy(() => import('./pages/Processes'))
const Network = lazy(() => import('./pages/Network'))
const SystemInfo = lazy(() => import('./pages/SystemInfo'))
const DiskUsage = lazy(() => import('./pages/DiskUsage'))
const Updates = lazy(() => import('./pages/Updates'))
const Logs = lazy(() => import('./pages/Logs'))
const Services = lazy(() => import('./pages/Services'))
const PenTest = lazy(() => import('./pages/PenTest'))
const Docker = lazy(() => import('./pages/Docker'))
const Cron = lazy(() => import('./pages/Cron'))
const Windows = lazy(() => import('./pages/Windows'))
const Settings = lazy(() => import('./pages/Settings'))
const Debug = lazy(() => import('./pages/Debug'))
const DepremUyari = lazy(() => import('./pages/DepremUyari'))
const OrmanYanginIzleme = lazy(() => import('./pages/OrmanYanginIzleme'))
const SelIzleme = lazy(() => import('./pages/SelIzleme'))
const HavaUyari = lazy(() => import('./pages/HavaUyari'))
const OllamaChat = lazy(() => import('./pages/OllamaChat'))
const SearchEngine = lazy(() => import('./pages/SearchEngine'))
const Speedtest = lazy(() => import('./pages/Speedtest'))
const Firewall = lazy(() => import('./pages/Firewall'))
const Temperature = lazy(() => import('./pages/Temperature'))
const Playbooks = lazy(() => import('./pages/Playbooks'))
const Security = lazy(() => import('./pages/Security'))
const Metrics = lazy(() => import('./pages/Metrics'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Backups = lazy(() => import('./pages/Backups'))
const Hosts = lazy(() => import('./pages/Hosts'))

function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} />
    </div>
  )
}

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
              <Suspense fallback={<PageFallback />}>
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
                <Route path="/security" element={<Security />} />
                <Route path="/metrics" element={<Metrics />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/backups" element={<Backups />} />
                <Route path="/hosts" element={<Hosts />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
              </Suspense>
              <DebugOverlay />
            </Layout>
          </ProtectedRoute>
          </SetupGuard>
        } />
      </Routes>
    </>
  )
}
