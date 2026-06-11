import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Key, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useSpotifyCredentials } from '@/hooks/useSpotifyCredentials'
import { SettingsGroup, SettingsRow } from '../components/SettingsPrimitives'
import { cn } from '@/lib/utils'

export default function AccountSection() {
  const { clientId, clientSecret, hasCredentials, save, clear } = useSpotifyCredentials()
  const [editId,     setEditId]     = useState(clientId)
  const [editSecret, setEditSecret] = useState(clientSecret)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const handleSave = async () => {
    if (!editId.trim() || !editSecret.trim()) return
    setSaving(true)
    save(editId.trim(), editSecret.trim())
    await new Promise((r) => setTimeout(r, 600))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="pb-2">
      <SettingsGroup title="Profile">
        <div className="px-4 py-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center text-2xl font-bold text-white shadow-lg">
            L
          </div>
          <div>
            <p className="font-bold text-[var(--text-primary)] text-lg">LethaboK</p>
            <p className="text-sm text-[var(--text-muted)]">lethabokhedama-png</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Self-hosted · Local</p>
          </div>
        </div>
        <SettingsRow label="Edit display name" onClick={() => {}} />
        <SettingsRow label="Change avatar"     onClick={() => {}} />
      </SettingsGroup>

      <SettingsGroup title="Spotify credentials">
        <div className="px-4 py-4 space-y-3">
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold',
              hasCredentials
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
            )}
          >
            <Key className="w-3.5 h-3.5" />
            {hasCredentials
              ? '✓ Spotify connected — search, playlists and trending are unlocked'
              : '⚠ No credentials — add your Spotify Client ID and Secret below'}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Client ID
            </label>
            <input
              value={editId}
              onChange={(e) => setEditId(e.target.value)}
              placeholder="e.g. c6081b467a154fd69ba432261b973cd5"
              className="w-full h-10 px-3 text-sm rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] font-mono"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Client Secret
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={editSecret}
                onChange={(e) => setEditSecret(e.target.value)}
                placeholder="e.g. 82ec996a6dba4218965bfea6483bd9c5"
                className="w-full h-10 px-3 pr-10 text-sm rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] font-mono"
              />
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-xs"
              >
                {showSecret ? 'hide' : 'show'}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="primary" size="sm" loading={saving} onClick={handleSave} className="flex-1">
              {saved ? <><Check className="w-4 h-4" /> Saved</> : 'Save credentials'}
            </Button>
            {hasCredentials && (
              <Button variant="danger" size="sm" onClick={clear}>
                Disconnect
              </Button>
            )}
          </div>

          <p className="text-xs text-[var(--text-muted)] leading-relaxed pt-1">
            Get your credentials at{' '}
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline"
            >
              developer.spotify.com/dashboard
            </a>
            . Create an app, copy the Client ID and Client Secret. These are stored locally and only
            used for metadata — Shulker never streams from Spotify.
          </p>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Danger zone">
        <SettingsRow
          label="Clear all app data"
          description="Wipes all settings, playlists, history. Cannot be undone."
          danger
          onClick={() => { localStorage.clear(); window.location.reload() }}
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}
