import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { X, AlertTriangle, MapPin, Activity, Clock, Crosshair, Volume2, VolumeX } from 'lucide-react'

const SES_URL = '/deprem_alert.mp3'

export default function DepremAlert() {
  const [uyarilar, setUyarilar] = useState([])
  const [tamEkran, setTamEkran] = useState(null)
  const [sesAktif, setSesAktif] = useState(true)
  const [bildirimler, setBildirimler] = useState([])
  const oncekiAnahtarlar = useRef(new Set())
  const sesRef = useRef(null)
  const audioCtx = useRef(null)

  useEffect(() => {
    try {
      audioCtx.current = new (window.AudioContext || window.webkitAudioContext)()
    } catch {}
  }, [])

  const uyariSesi = () => {
    if (!sesAktif || !audioCtx.current) return
    try {
      const ctx = audioCtx.current
      if (ctx.state === 'suspended') ctx.resume()
      const now = ctx.currentTime
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'square'
        osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, now + i * 0.3)
        gain.gain.setValueAtTime(0.3, now + i * 0.3)
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.3 + 0.25)
        osc.start(now + i * 0.3)
        osc.stop(now + i * 0.3 + 0.25)
      }
    } catch {}
  }

  const kritikSesi = () => {
    if (!sesAktif || !audioCtx.current) return
    try {
      const ctx = audioCtx.current
      if (ctx.state === 'suspended') ctx.resume()
      const now = ctx.currentTime
      for (let i = 0; i < 8; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(i % 2 === 0 ? 660 : 880, now + i * 0.2)
        gain.gain.setValueAtTime(0.35, now + i * 0.2)
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.2 + 0.18)
        osc.start(now + i * 0.2)
        osc.stop(now + i * 0.2 + 0.18)
      }
    } catch {}
  }

  useEffect(() => {
    const fetchUyari = async () => {
      try {
        const data = await api('/api/deprem/uyari')
        for (const d of data) {
          const anahtar = `${d.tarih}_${d.saat}_${d.yer}`
          if (oncekiAnahtarlar.current.has(anahtar)) continue
          oncekiAnahtarlar.current.add(anahtar)

          if (['KRITIK', 'YUKSEK', 'ORTA'].includes(d.risk_seviyesi) && d.istanbula_uzaklik < 200) {
            setTamEkran(d)
            kritikSesi()
            setUyarilar(prev => [d, ...prev].slice(0, 20))
          } else if (d.risk_seviyesi === 'DIKKAT' || (d.magnitude >= 3.0 && d.istanbula_uzaklik < 300)) {
            const bild = { ...d, id: anahtar, gosterim: Date.now() }
            setBildirimler(prev => [bild, ...prev].slice(0, 5))
            uyariSesi()
          }
        }
      } catch {}
    }

    fetchUyari()
    const id = setInterval(fetchUyari, 15000)
    return () => clearInterval(id)
  }, [sesAktif])

  useEffect(() => {
    if (bildirimler.length === 0) return
    const id = setInterval(() => {
      setBildirimler(prev => prev.filter(b => Date.now() - b.gosterim < 8000))
    }, 1000)
    return () => clearInterval(id)
  }, [bildirimler.length])

  const RiskBadge = ({ risk }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full
      ${risk === 'KRITIK' ? 'bg-red-600 text-white' :
        risk === 'YUKSEK' ? 'bg-orange-600 text-white' :
        risk === 'ORTA' ? 'bg-yellow-600 text-black' :
        'bg-gray-700 text-gray-300'}`}>
      {risk}
    </span>
  )

  return (
    <>
      {tamEkran && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
          onClick={() => setTamEkran(null)}>
          <div className="bg-gray-900 border-2 border-red-600 rounded-2xl shadow-2xl shadow-red-600/30 max-w-lg w-full mx-4 p-8 text-center animate-[pulse_2s_ease-in-out_infinite]"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-4">
              <div className="w-24 h-24 rounded-full bg-red-600/20 border-4 border-red-500 flex items-center justify-center animate-[ping_2s_ease-in-out_infinite]">
                <AlertTriangle size={48} className="text-red-500" />
              </div>
            </div>
            <h1 className="text-4xl font-black text-red-500 mb-2 tracking-wider">DEPREM!</h1>
            <div className="flex justify-center gap-2 mb-4">
              <RiskBadge risk={tamEkran.risk_seviyesi} />
              <span className="text-2xl font-bold text-white">M{tamEkran.magnitude.toFixed(1)}</span>
            </div>
            <p className="text-lg text-gray-200 mb-2">{tamEkran.yer}</p>
            <p className="text-sm text-gray-400 mb-6">
              {tamEkran.istanbula_uzaklik} km — {tamEkran.derinlik} km derinlik
            </p>
            <div className="flex items-center justify-center gap-6 text-xs text-gray-500 mb-6">
              <span className="flex items-center gap-1"><Clock size={12} />{tamEkran.tarih.slice(5)} {tamEkran.saat}</span>
              <span className="flex items-center gap-1"><MapPin size={12} />{tamEkran.enlem}, {tamEkran.boylam}</span>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setTamEkran(null)}
                className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors">
                Tamam
              </button>
              <button onClick={() => setSesAktif(p => !p)}
                className={`px-4 py-2.5 rounded-lg text-sm transition-colors ${sesAktif ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}>
                {sesAktif ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 right-4 z-40 space-y-2 max-w-sm w-full pointer-events-none">
        {bildirimler.map(b => (
          <div key={b.id}
            className="pointer-events-auto bg-gray-900 border border-orange-700 rounded-xl p-4 shadow-xl shadow-orange-900/30 animate-[slideInRight_0.3s_ease-out]">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <AlertTriangle size={20} className="text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-orange-300">Deprem Algılandı</span>
                  <RiskBadge risk={b.risk_seviyesi} />
                </div>
                <p className="text-sm text-gray-300 truncate">{b.yer}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Activity size={11} />M{b.magnitude.toFixed(1)}</span>
                  <span className="flex items-center gap-1"><Crosshair size={11} />{b.istanbula_uzaklik} km</span>
                </div>
              </div>
              <button onClick={() => setBildirimler(prev => prev.filter(x => x.id !== b.id))}
                className="shrink-0 text-gray-600 hover:text-gray-400">
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </>
  )
}
