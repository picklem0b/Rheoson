import { ExternalLink, Music2, Trash2 } from 'lucide-react'
import { APP_VERSION } from '@/lib/constants'
import { SettingsGroup, SettingsRow } from '../components/SettingsPrimitives'

const STACK = [
  { label: 'yt-dlp',        value: '2026.3.17' },
  { label: 'ytmusicapi',    value: '1.12.0'    },
  { label: 'FastAPI',       value: '0.103+'    },
  { label: 'React',         value: '18.3'      },
  { label: 'Framer Motion', value: '11'        },
  { label: 'Howler.js',     value: '2.2.4'     },
  { label: 'Zustand',       value: '4.5'       },
]

export default function AboutSection() {
  return (
    <div className="pb-2">
      <SettingsGroup>
        <div className="flex items-center gap-4 px-4 py-5">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-[var(--accent-subtle)]">
            <Music2 className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="font-bold text-[var(--text-primary)] text-lg tracking-tight">Shulker</p>
            <p className="text-sm text-[var(--text-muted)]">v{APP_VERSION}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Built by LethaboK</p>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Stack">
        {STACK.map((d) => (
          <SettingsRow key={d.label} label={d.label} value={d.value} />
        ))}
      </SettingsGroup>

      <SettingsGroup title="Links">
        <SettingsRow
          label="GitHub"
          description="lethabokhedama-png/shulker"
          onClick={() => window.open('https://github.com/lethabokhedama-png/shulker')}
        >
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow
          label="Report a bug"
          onClick={() => window.open('https://github.com/lethabokhedama-png/shulker/issues')}
        >
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow label="Terms of service" onClick={() => {}}>
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow label="Privacy policy" onClick={() => {}}>
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Danger zone">
        <SettingsRow
          label="Clear all app data"
          description="Reset everything — settings, theme, history, playlists. Cannot be undone."
          danger
          onClick={() => { localStorage.clear(); window.location.reload() }}
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}
