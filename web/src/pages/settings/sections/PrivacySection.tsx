import { useState } from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import { SettingsGroup, SettingsRow, Toggle } from '../components/SettingsPrimitives'

export default function PrivacySection() {
  const [history,   setHistory]   = useState(true)
  const [analytics, setAnalytics] = useState(false)
  const [searchLog, setSearchLog] = useState(true)

  return (
    <div className="pb-2">
      <SettingsGroup title="History">
        <SettingsRow
          label="Save play history"
          description="Track your recently played songs across sessions"
        >
          <Toggle value={history} onChange={setHistory} />
        </SettingsRow>
        <SettingsRow
          label="Save search history"
          description="Remember recent searches"
        >
          <Toggle value={searchLog} onChange={setSearchLog} />
        </SettingsRow>
        <SettingsRow label="Clear play history" danger onClick={() => {}}>
          <Trash2 className="w-4 h-4 text-red-400" />
        </SettingsRow>
        <SettingsRow label="Clear search history" danger onClick={() => {}}>
          <Trash2 className="w-4 h-4 text-red-400" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Data">
        <SettingsRow
          label="Anonymous analytics"
          description="Help improve Shulker by sharing anonymous usage data. No personal data is collected."
        >
          <Toggle value={analytics} onChange={setAnalytics} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Legal">
        <SettingsRow label="Terms of service" onClick={() => {}}>
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow label="Privacy policy" onClick={() => {}}>
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow
          label="Open source licences"
          onClick={() => window.open('https://www.gnu.org/licenses/gpl-3.0-standalone.html', '_blank')}
        >
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}
