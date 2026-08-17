import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, RefreshCw, ExternalLink, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { usePersisted } from '@/hooks/persisted.hook'
import { SettingsGroup, SettingsRow, Toggle } from '../components/SettingsPrimitives'

const DEFAULT_DIRS = [
  { path: '/data/data/com.termux/files/home/shulker/music', active: true  },
  { path: '/storage/emulated/0/Music',                      active: true  },
  { path: '/storage/emulated/0/Download',                   active: false },
]

export default function StorageSection() {
  const [dirs,      setDirs]      = usePersisted('music-dirs', DEFAULT_DIRS)
  const [customDir, setCustomDir] = useState('')
  const [adding,    setAdding]    = useState(false)
  const [rescanning, setRescanning] = useState(false)

  const addDir = () => {
    if (!customDir.trim()) return
    setDirs([...dirs, { path: customDir.trim(), active: true }])
    setCustomDir('')
    setAdding(false)
  }

  const rescan = async () => {
    setRescanning(true)
    try { await fetch('/api/library/rescan', { method: 'POST' }) } catch {}
    setTimeout(() => setRescanning(false), 1500)
  }

  return (
    <div className="pb-2">
      <SettingsGroup title="Music directories">
        {dirs.map((d, i) => (
          <div key={d.path} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {d.path.split('/').pop()}
              </p>
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{d.path}</p>
            </div>
            <Toggle
              value={d.active}
              onChange={(v) =>
                setDirs(dirs.map((x, j) => (j === i ? { ...x, active: v } : x)))
              }
            />
          </div>
        ))}

        <AnimatePresence>
          {adding && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 py-3 flex gap-2">
                <input
                  value={customDir}
                  onChange={(e) => setCustomDir(e.target.value)}
                  placeholder="/path/to/music"
                  className="flex-1 h-9 px-3 text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                />
                <Button size="sm" variant="primary" onClick={addDir}>Add</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <SettingsRow
          label="Add directory"
          description="Scan a new folder for music files"
          onClick={() => setAdding(!adding)}
        >
          <FolderOpen className="w-4 h-4 text-[var(--accent)]" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Library">
        <SettingsRow
          label="Rescan library"
          description="Re-index all music directories"
          onClick={rescan}
        >
          <RefreshCw className={rescanning ? 'w-4 h-4 text-[var(--accent)] animate-spin' : 'w-4 h-4 text-[var(--text-muted)]'} />
        </SettingsRow>
        <SettingsRow
          label="Export library"
          description="Save your library as JSON"
          onClick={() => {}}
        >
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Cache">
        <SettingsRow
          label="Clear stream cache"
          danger
          onClick={async () => {
            try { await fetch('/api/stream/cache/clear', { method: 'POST' }) } catch {}
          }}
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </SettingsRow>
        <SettingsRow label="Clear artwork cache" danger onClick={() => {}}>
          <Trash2 className="w-4 h-4 text-red-400" />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}