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
import Settings from './pages/Settings'
import Debug from './pages/Debug'
import DepremUyari from './pages/DepremUyari'
import DepremAlert from './components/DepremAlert'
import OllamaChat from './pages/OllamaChat'
import Login from './pages/Login'
import { isAuthenticated } from './api'

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <>
      <DepremAlert />
      <Routes>
        <Route path="/login" element={isAuthenticated() ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
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
                <Route path="/ai" element={<OllamaChat />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
              <DebugOverlay />
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </>
  )
}
