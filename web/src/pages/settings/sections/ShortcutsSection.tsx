import { SettingsGroup } from "../components/SettingsPrimitives";

const GROUPS: { label: string; rows: { key: string; action: string }[] }[] = [
   {
      label: "Playback",
      rows: [
         { key: "Space", action: "Play / Pause" },
         { key: "N", action: "Next track" },
         { key: "P", action: "Previous track" },
         { key: "R", action: "Cycle repeat mode" },
         { key: "S", action: "Toggle shuffle" },
         { key: "M", action: "Mute / unmute" }
      ]
   },
   {
      label: "Seeking & volume",
      rows: [
         { key: "→", action: "Seek forward 10 s" },
         { key: "←", action: "Seek back 10 s" },
         { key: "↑", action: "Volume +10%" },
         { key: "↓", action: "Volume −10%" }
      ]
   },
   {
      label: "Panels",
      rows: [
         { key: "Q", action: "Toggle queue" },
         { key: "L", action: "Toggle lyrics" },
         { key: "F", action: "Fullscreen player" },
         { key: "Esc", action: "Close all panels" }
      ]
   },
   {
      label: "Navigation",
      rows: [
         { key: "Ctrl + F", action: "Focus search bar" },
         { key: "Ctrl + D", action: "Download current track" },
         { key: "Ctrl + K", action: "Command palette" }
      ]
   }
];

export default function ShortcutsSection() {
   return (
      <div className='pb-4'>
         {GROUPS.map(g => (
            <SettingsGroup key={g.label} title={g.label}>
               {g.rows.map(r => (
                  <div
                     key={r.key}
                     className='flex items-center justify-between px-4 py-[12px] border-b border-[var(--border)]/50 last:border-0'>
                     <span className='text-[15px] font-[440] text-[var(--text-primary)]'>
                        {r.action}
                     </span>
                     <kbd className='inline-flex items-center px-2.5 py-1 rounded-[8px] text-[12px] font-mono font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] shadow-[0_1px_0_var(--border)] flex-shrink-0 ml-4'>
                        {r.key}
                     </kbd>
                  </div>
               ))}
            </SettingsGroup>
         ))}

         <p className='text-[12px] text-[var(--text-muted)] px-1 leading-relaxed'>
            Shortcuts work when focus is outside a text input. Press{" "}
            <kbd className='inline-flex items-center px-1.5 py-0.5 rounded-[6px] text-[11px] font-mono bg-[var(--bg-elevated)] border border-[var(--border)]'>
               Tab
            </kbd>{" "}
            to move focus out of an input first.
         </p>
      </div>
   );
}
