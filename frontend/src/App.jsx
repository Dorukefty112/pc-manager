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
import DepremAlert from './components/DepremAlert'
import OllamaChat from './pages/OllamaChat'
import SearchEngine from './pages/SearchEngine'
import Speedtest from './pages/Speedtest'
import Firewall from './pages/Firewall'
import Temperature from './pages/Temperature'
import Playbooks from './pages/Playbooks'
import Login from './pages/Login'
import Setup from './pages/Setup'
import { useI18n } from './context/I18nContext'
import { isAuthenticated } from './api'
import { useState, useEffect } from 'react'
import { api } from './api'

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return children
}

function SetupGuard({ children }) {
  const { t } = useI18n()
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    api('/api/setup').then(d => setStatus(d.completed ? 'done' : 'setup')).catch(() => setStatus('done'))
  }, [])
  if (status === 'loading') return <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4"><div className="text-gray-500">{t("Yükleniyor...")}</div></div>
  if (status === 'setup') return <Setup />
  return children
}

export default function App() {
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
