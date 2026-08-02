import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import { I18nProvider } from './context/I18nContext'
import './index.css'

class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error("Global React Error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', background: '#090d16', color: '#f87171',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24, fontFamily: 'sans-serif'
        }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: 12 }}>Uygulama Hata Verdi</h2>
          <div style={{
            background: '#1e1b4b', color: '#e0e7ff', padding: 16, borderRadius: 8,
            maxWidth: '100%', overflowX: 'auto', fontSize: '0.8rem', whiteSpace: 'pre-wrap', marginBottom: 16
          }}>
            {this.state.error?.toString() || 'Bilinmeyen Hata'}
            {'\n'}
            {this.state.error?.stack}
          </div>
          <button
            onClick={() => {
              localStorage.clear()
              window.location.reload()
            }}
            style={{
              padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            Sıfırla ve Yeniden Başlat
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <GlobalErrorBoundary>
    <BrowserRouter>
      <I18nProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </I18nProvider>
    </BrowserRouter>
  </GlobalErrorBoundary>
)
