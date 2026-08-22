import { SettingsGroup } from '../components/SettingsPrimitives';

const SHORTCUTS = [
	{ key: 'Space', action: 'Play / Pause' },
	{ key: '← →', action: 'Seek ±10 seconds' },
	{ key: '↑ ↓', action: 'Volume ±10%' },
	{ key: 'N', action: 'Next track' },
	{ key: 'P', action: 'Previous track' },
	{ key: 'R', action: 'Cycle repeat mode' },
	{ key: 'S', action: 'Toggle shuffle' },
	{ key: 'Q', action: 'Toggle queue panel' },
	{ key: 'L', action: 'Toggle lyrics panel' },
	{ key: 'M', action: 'Mute / unmute' },
	{ key: 'F', action: 'Fullscreen player' },
	{ key: 'Ctrl + F', action: 'Focus search' },
	{ key: 'Ctrl + D', action: 'Download current track' },
	{ key: 'Esc', action: 'Close panels' }
];

export default function ShortcutsSection() {
	return (
		<div className='pb-2'>
			<SettingsGroup title='Player controls'>
				{SHORTCUTS.map(s => (
					<div
						key={s.key}
						className='flex items-center justify-between gap-4 px-4 py-3 border-b border-[var(--border)] last:border-0'
					>
						<span className='text-sm text-[var(--text-secondary)]'>
							{s.action}
						</span>
						<kbd className='px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] flex-shrink-0'>
							{s.key}
						</kbd>
					</div>
				))}
			</SettingsGroup>
		</div>
	);
}
