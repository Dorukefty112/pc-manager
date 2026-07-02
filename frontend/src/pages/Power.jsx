import { useState } from 'react'
import { api } from '../api'
import { useI18n } from '../context/I18nContext'
import { Power as PowerIcon, RotateCw, Moon, LogOut, AlertTriangle, Zap } from 'lucide-react'

export default function Power() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(null)
  const [result, setResult] = useState('')

  const actions = [
    {
      key: 'shutdown', label: t('Kapat'), icon: PowerIcon, color: '#ef4444',
      bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)',
      desc: t('Sistemi tamamen kapatır'),
      confirm: t('Bilgisayar KAPANACAK! Emin misin?'),
    },
    {
      key: 'reboot', label: t('Yeniden Başlat'), icon: RotateCw, color: '#f59e0b',
      bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)',
      desc: t('Sistemi yeniden başlatır'),
      confirm: t('Bilgisayar YENİDEN BAŞLAYACAK! Emin misin?'),
    },
    {
      key: 'suspend', label: t('Uyku'), icon: Moon, color: '#60a5fa',
      bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.25)',
      desc: t('Sistemi uyku moduna alır'),
      confirm: t('Bilgisayar uyku moduna geçecek. Emin misin?'),
    },
    {
      key: 'logout', label: t('Oturumu Kapat'), icon: LogOut, color: '#9ca3af',
      bg: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.2)',
      desc: t('Mevcut kullanıcı oturumunu kapatır'),
      confirm: t('Oturumun kapatılacak. Emin misin?'),
    },
  ]

  const run = async (action) => {
    const a = actions.find(x => x.key === action)
    if (!confirm(a.confirm)) return
    setLoading(action); setResult('')
    try {
      await api(`/api/power/${action}`, { method: 'POST' })
      setResult(t('{label} komutu gönderildi.').replace('{label}', a.label))
    } catch (e) {
      setResult(t('Hata: ') + e.message)
    }
    setLoading(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">
          <span className="page-title-icon"><Zap size={18} color="var(--accent)" /></span>
          {t('Güç Yönetimi')}
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {actions.map(({ key, label, icon: Icon, color, bg, border, desc }) => (
          <button key={key} onClick={() => run(key)} disabled={loading === key} style={{
            background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: '22px 20px',
            textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s ease',
            opacity: loading === key ? 0.6 : 1,
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${color}20` }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{
              width: 46, height: 46, borderRadius: 12, marginBottom: 14,
              background: `${color}18`, border: `1px solid ${border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {loading === key
                ? <div className="spinner" style={{ width: 20, height: 20, borderColor: `${color}40`, borderTopColor: color }} />
                : <Icon size={22} color={color} />
              }
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{desc}</div>
          </button>
        ))}
      </div>

      {result && (
        <div style={{
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 12, padding: '12px 16px',
          fontSize: '0.85rem', color: '#22c55e',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Zap size={15} /> {result}
        </div>
      )}

      {/* Warning */}
      <div style={{
        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: 12, padding: '14px 16px',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: '0.82rem', color: 'rgba(239,68,68,0.9)', lineHeight: 1.6 }}>
          <strong>{t('Uyarı:')} </strong>
          {t('Kapatma ve yeniden başlatma işlemleri sunucuyu kapatacağı için web arayüzü de kapanacaktır. Erişmek için bilgisayarın tekrar açılması gerekecektir.')}
        </div>
      </div>
    </div>
  )
}
