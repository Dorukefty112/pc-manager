import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { MapPin, Clock, AlertTriangle, Activity, Crosshair, Bell, BellOff, RefreshCw } from 'lucide-react'

const RISK_RENK = {
  KRITIK: 'text-red-300 bg-red-900/30 border-red-700',
  YUKSEK: 'text-orange-300 bg-orange-900/30 border-orange-700',
  ORTA: 'text-yellow-300 bg-yellow-900/30 border-yellow-700',
  DIKKAT: 'text-cyan-300 bg-cyan-900/30 border-cyan-700',
  BILGI: 'text-gray-300 bg-gray-800 border-gray-700',
  BILINMIYOR: 'text-gray-500 bg-gray-800/50 border-gray-700',
}

const RISK_SIRALAMA = { KRITIK: 0, YUKSEK: 1, ORTA: 2, DIKKAT: 3, BILGI: 4, BILINMIYOR: 5 }

export default function DepremUyari() {
  const [depremler, setDepremler] = useState([])
  const [secili, setSecili] = useState(null)
  const [bildirim, setBildirim] = useState(true)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState(null)
  const [filtre, setFiltre] = useState('tum')
  const oncekiAnahtarlar = useRef(new Set())

  const fetchData = async () => {
    try {
      const data = await api('/api/deprem/son')
      if (!Array.isArray(data)) throw new Error('Geçersiz veri')
      const sirali = data.sort((a, b) => {
        const riskA = RISK_SIRALAMA[a.risk_seviyesi] || 5
        const riskB = RISK_SIRALAMA[b.risk_seviyesi] || 5
        if (riskA !== riskB) return riskA - riskB
        return `${b.tarih} ${b.saat}`.localeCompare(`${a.tarih} ${a.saat}`)
      })
      setDepremler(sirali)
      setHata(null)
      setYukleniyor(false)
    } catch (e) {
      setHata('Deprem verileri alinamadi. Veri kaynagi su an erisilemez durumda.')
      setYukleniyor(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30000)
    return () => clearInterval(id)
  }, [])

  const filtreli = depremler.filter(d => {
    if (filtre === 'istanbul') return d.istanbula_uzaklik < 200
    if (filtre === 'kritik') return ['KRITIK', 'YUKSEK', 'ORTA'].includes(d.risk_seviyesi)
    return true
  })

  const RenkBadge = ({ risk }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${RISK_RENK[risk] || RISK_RENK.BILGI}`}>
      {risk === 'KRITIK' && <AlertTriangle size={10} />}
      {risk}
    </span>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold">Deprem İzleme</h2>
          <span className="text-xs text-gray-500">Kandilli Rasathanesi</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={filtre} onChange={e => setFiltre(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-1.5 text-gray-300">
            <option value="tum">Tümü</option>
            <option value="istanbul">İstanbul Çevresi</option>
            <option value="kritik">Kritik Olanlar</option>
          </select>
          <button onClick={() => setBildirim(p => !p)}
            className={`p-2 rounded-lg transition-colors ${bildirim ? 'bg-cyan-900/30 text-cyan-400' : 'bg-gray-800 text-gray-500'}`}>
            {bildirim ? <Bell size={16} /> : <BellOff size={16} />}
          </button>
          <button onClick={fetchData} className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {hata && (
        <div className="mb-4 p-4 bg-red-900/20 border border-red-700 rounded-xl text-red-300 text-sm text-center">
          {hata}
          <button onClick={fetchData} className="ml-3 underline hover:text-red-200">Tekrar dene</button>
        </div>
      )}

      {yukleniyor ? (
        <div className="text-center text-gray-500 mt-20">Deprem verileri yükleniyor...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-2">
            {filtreli.length === 0 && (
              <div className="text-center text-gray-500 py-20">Bu filtrede deprem bulunamadı.</div>
            )}
            {filtreli.slice(0, 50).map((d, i) => {
              const renk = RISK_RENK[d.risk_seviyesi] || RISK_RENK.BILGI
              return (
                <div key={`${d.tarih}${d.saat}${i}`}
                  onClick={() => setSecili(secili === d ? null : d)}
                  className={`bg-gray-900 rounded-xl border cursor-pointer transition-all duration-150
                    ${secili === d ? 'border-cyan-700 ring-1 ring-cyan-700/50' : 'border-gray-800 hover:border-gray-700'}
                    ${d.risk_seviyesi === 'KRITIK' ? 'animate-pulse' : ''}`}>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-bold ${renk}`}>
                          <Activity size={14} />
                          M{d.magnitude > 0 ? d.magnitude.toFixed(1) : '-.-'}
                        </div>
                        <span className="text-sm text-gray-300 truncate">{d.yer}</span>
                      </div>
                      <RenkBadge risk={d.risk_seviyesi} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                      <span className="flex items-center gap-1"><Clock size={12} />{d.tarih.slice(5)} {d.saat}</span>
                      <span className="flex items-center gap-1"><Crosshair size={12} />{d.istanbula_uzaklik} km</span>
                      <span>{d.derinlik} km derinlik</span>
                    </div>
                    {secili === d && (
                      <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-2 gap-2 text-xs text-gray-400">
                        <span>Enlem: {d.enlem}</span>
                        <span>Boylam: {d.boylam}</span>
                        <span>Derinlik: {d.derinlik} km</span>
                        <span>İstanbul'a: {d.istanbula_uzaklik} km</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="space-y-4">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                <MapPin size={16} className="text-cyan-400" />
                İstanbul Analizi
              </h3>
              <div className="space-y-3">
                {['KRITIK', 'YUKSEK', 'ORTA'].map(seviye => {
                  const sayi = depremler.filter(d => d.risk_seviyesi === seviye && d.istanbula_uzaklik < 200).length
                  if (sayi === 0 && seviye !== 'KRITIK') return null
                  return (
                    <div key={seviye} className="flex items-center justify-between">
                      <RenkBadge risk={seviye} />
                      <span className="text-sm font-bold">{sayi} deprem</span>
                    </div>
                  )
                })}
                {depremler.filter(d => d.risk_seviyesi === 'KRITIK').length === 0 && (
                  <div className="text-center text-gray-500 text-sm py-4">Şu an kritik risk yok</div>
                )}
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Risk Seviyeleri</h3>
              <div className="space-y-2 text-xs">
                {[
                  { seviye: 'KRITIK', aciklama: 'M≥5, 200km içi', renk: 'bg-red-500' },
                  { seviye: 'YUKSEK', aciklama: 'M≥4, 150km içi', renk: 'bg-orange-500' },
                  { seviye: 'ORTA', aciklama: 'M≥3, 100km içi', renk: 'bg-yellow-500' },
                  { seviye: 'DIKKAT', aciklama: 'M≥3, Marmara', renk: 'bg-cyan-500' },
                  { seviye: 'BILGI', aciklama: 'Düşük risk', renk: 'bg-gray-500' },
                ].map(l => (
                  <div key={l.seviye} className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${l.renk}`} />
                    <span className="font-medium text-gray-300">{l.seviye}</span>
                    <span className="text-gray-500">{l.aciklama}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <div className="text-xs text-gray-500">
                <p>Veri kaynağı: Boğaziçi Üniversitesi Kandilli Rasathanesi ve Deprem Araştırma Enstitüsü</p>
                <p className="mt-2">Yedek: AFAD Deprem Veri Merkezi</p>
                <p className="mt-1">Her 30 saniyede bir güncellenir.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
