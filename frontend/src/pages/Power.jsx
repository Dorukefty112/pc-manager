import { useState } from 'react'
import { api } from '../api'
import { Power as PowerIcon, RotateCw, Moon, LogOut, AlertTriangle } from 'lucide-react'

const actions = [
  { key: 'shutdown', label: 'Kapat', icon: PowerIcon, color: 'red', desc: 'Sistemi tamamen kapatır', confirm: 'Bilgisayar KAPANACAK! Emin misin?' },
  { key: 'reboot', label: 'Yeniden Başlat', icon: RotateCw, color: 'yellow', desc: 'Sistemi yeniden başlatır', confirm: 'Bilgisayar YENİDEN BAŞLAYACAK! Emin misin?' },
  { key: 'suspend', label: 'Uyku', icon: Moon, color: 'blue', desc: 'Sistemi uyku moduna alır', confirm: 'Bilgisayar uyku moduna geçecek. Emin misin?' },
  { key: 'logout', label: 'Oturumu Kapat', icon: LogOut, color: 'gray', desc: 'Mevcut kullanıcı oturumunu kapatır', confirm: 'Oturumun kapatılacak. Emin misin?' },
]

export default function Power() {
  const [loading, setLoading] = useState(null)
  const [result, setResult] = useState('')

  const run = async (action) => {
    const a = actions.find(x => x.key === action)
    if (!confirm(a.confirm)) return
    setLoading(action)
    setResult('')
    try {
      await api(`/api/power/${action}`, { method: 'POST' })
      setResult(`${a.label} komutu gönderildi.`)
    } catch (e) {
      setResult(`Hata: ${e.message}`)
    }
    setLoading(null)
  }

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-semibold mb-6">Güç Yönetimi</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {actions.map(({ key, label, icon: Icon, color, desc }) => (
          <button
            key={key}
            onClick={() => run(key)}
            disabled={loading === key}
            className={`flex items-center gap-4 bg-gray-900 rounded-xl border border-gray-800 p-5 text-left hover:bg-gray-800 transition-colors disabled:opacity-50`}
          >
            <div className={`p-3 rounded-lg ${
              color === 'red' ? 'bg-red-900/30 text-red-400' :
              color === 'yellow' ? 'bg-yellow-900/30 text-yellow-400' :
              color === 'blue' ? 'bg-blue-900/30 text-blue-400' :
              'bg-gray-800 text-gray-400'
            }`}>
              {loading === key ? <AlertTriangle size={24} className="animate-pulse" /> : <Icon size={24} />}
            </div>
            <div>
              <div className="font-medium text-white">{label}</div>
              <div className="text-sm text-gray-500">{desc}</div>
            </div>
          </button>
        ))}
      </div>

      {result && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-sm text-gray-300">
          {result}
        </div>
      )}

      <div className="mt-8 bg-red-950/30 border border-red-900/50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
          <div className="text-sm text-red-300">
            <strong>Uyarı:</strong> Kapatma ve yeniden başlatma işlemleri sunucuyu kapatacağı için web arayüzü de kapanacaktır.
            Erişmek için bilgisayarın tekrar açılması gerekecektir.
          </div>
        </div>
      </div>
    </div>
  )
}
