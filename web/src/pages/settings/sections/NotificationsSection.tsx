import { usePersisted } from '@/hooks/persisted.hook'
import { SettingsGroup, SettingsRow, Toggle } from '../components/SettingsPrimitives'

export default function NotificationsSection() {
  const [dlDone,  setDlDone]  = usePersisted('notif-dl-done', true)
  const [dlFail,  setDlFail]  = usePersisted('notif-dl-fail', true)
  const [sound,   setSound]   = usePersisted('notif-sound', true)
  const [updates, setUpdates] = usePersisted('notif-updates', false)

  return (
    <div className="pb-2">
      <SettingsGroup title="Downloads">
        <SettingsRow
          label="Download complete"
          description="Play a sound and show a notification when a track finishes"
        >
          <Toggle value={dlDone} onChange={setDlDone} />
        </SettingsRow>
        <SettingsRow
          label="Download failed"
          description="Alert when a download encounters an error"
        >
          <Toggle value={dlFail} onChange={setDlFail} />
        </SettingsRow>
        <SettingsRow
          label="Sound effects"
          description="Play rhea.mp3 on download complete"
        >
          <Toggle value={sound} onChange={setSound} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="App">
        <SettingsRow
          label="Update available"
          description="Notify when a new version of Shulker is available"
        >
          <Toggle value={updates} onChange={setUpdates} />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}