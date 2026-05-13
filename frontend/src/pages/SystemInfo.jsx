import { useState, useEffect } from 'react'
import { api } from '../api'
import { Monitor, Cpu, HardDrive, Users, Clock, CircuitBoard } from 'lucide-react'

export default function SystemInfo() {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    api('/api/system/info').then(setInfo).catch(() => {})
  }, [])

  if (!info) return <div className="text-center text-gray-500 mt-20">Yükleniyor...</div>

  const fmtBytes = (b) => {
    if (!b) return '0'
    if (b > 1e12) return `${(b / 1e12).toFixed(2)} TB`
    if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`
    return `${(b / 1e6).toFixed(0)} MB`
  }

  const rows = [
    { label: 'Hostname', value: info.hostname, icon: Monitor },
    { label: 'İşletim Sistemi', value: info.os, icon: Monitor },
    { label: 'Kernel', value: info.kernel, icon: CircuitBoard },
    { label: 'Mimari', value: info.arch, icon: CircuitBoard },
    { label: 'Açık Kalma', value: `${info.uptime_days} gün`, icon: Clock },
    { label: 'Çekirdekler', value: `${info.cpu.physical_cores} fiziksel / ${info.cpu.logical_cores} mantıksal`, icon: Cpu },
    { label: 'CPU Modeli', value: info.cpu.brand, icon: Cpu },
    { label: 'Max Frekans', value: info.cpu.max_freq ? `${info.cpu.max_freq.toFixed(0)} MHz` : '-', icon: Cpu },
    { label: 'Toplam RAM', value: fmtBytes(info.memory.total), icon: HardDrive },
    { label: 'Swap', value: fmtBytes(info.memory.swap_total), icon: HardDrive },
    { label: 'Kullanıcılar', value: info.users?.join(', ') || '-', icon: Users },
  ]

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-semibold mb-6">Sistem Bilgileri</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {rows.map(r => (
          <div key={r.label} className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-gray-800 text-cyan-400"><r.icon size={18} /></div>
            <div className="min-w-0">
              <div className="text-xs text-gray-500">{r.label}</div>
              <div className="text-sm text-gray-200 truncate">{r.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="font-medium mb-4">Disk Bölümleri</h3>
        <div className="space-y-2">
          {info.disks?.filter(Boolean).map((d, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-mono text-cyan-400">{d.device}</span>
                <span className="text-gray-400">{d.mount}</span>
              </div>
              <div className="text-xs text-gray-500">{d.fstype} &middot; {fmtBytes(d.used)} / {fmtBytes(d.total)} ({d.percent.toFixed(1)}%)</div>
              <div className="w-full h-1.5 bg-gray-700 rounded-full mt-1">
                <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.min(d.percent, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
