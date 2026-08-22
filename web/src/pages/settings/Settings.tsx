import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
	Palette,
	Volume2,
	Download,
	Keyboard,
	Info,
	ChevronLeft,
	User,
	Bell,
	Shield,
	HardDrive
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { APP_VERSION } from '@/lib/constants';
import { cn } from '@/lib/utils';

import AppearanceSection from './sections/AppearanceSection';
import AudioSection from './sections/AudioSection';
import DownloadsSection from './sections/DownloadsSection';
import StorageSection from './sections/StorageSection';
import AccountSection from './sections/AccountSection';
import PrivacySection from './sections/PrivacySection';
import NotificationsSection from './sections/NotificationsSection';
import ShortcutsSection from './sections/ShortcutsSection';
import AboutSection from './sections/AboutSection';

type Section =
	| 'appearance'
	| 'audio'
	| 'downloads'
	| 'storage'
	| 'account'
	| 'privacy'
	| 'notifications'
	| 'shortcuts'
	| 'about';

const SECTIONS: {
	id: Section;
	label: string;
	icon: React.ElementType;
	description: string;
	color: string;
}[] = [
	{
		id: 'appearance',
		label: 'Appearance',
		icon: Palette,
		description: 'Theme, colours, transparency',
		color: 'from-purple-500 to-violet-600'
	},
	{
		id: 'audio',
		label: 'Audio',
		icon: Volume2,
		description: 'Quality, crossfade, gapless',
		color: 'from-blue-500 to-cyan-500'
	},
	{
		id: 'downloads',
		label: 'Downloads',
		icon: Download,
		description: 'Format, quality, options',
		color: 'from-green-500 to-emerald-600'
	},
	{
		id: 'storage',
		label: 'Storage',
		icon: HardDrive,
		description: 'Music dirs, cache, library',
		color: 'from-orange-500 to-amber-500'
	},
	{
		id: 'account',
		label: 'Account',
		icon: User,
		description: 'Profile, Spotify credentials',
		color: 'from-pink-500 to-rose-500'
	},
	{
		id: 'privacy',
		label: 'Privacy',
		icon: Shield,
		description: 'History, data, permissions',
		color: 'from-slate-500 to-zinc-600'
	},
	{
		id: 'notifications',
		label: 'Notifications',
		icon: Bell,
		description: 'Download alerts, updates',
		color: 'from-yellow-500 to-orange-500'
	},
	{
		id: 'shortcuts',
		label: 'Shortcuts',
		icon: Keyboard,
		description: 'Keyboard controls',
		color: 'from-indigo-500 to-blue-600'
	},
	{
		id: 'about',
		label: 'About',
		icon: Info,
		description: `v${APP_VERSION} · Credits`,
		color: 'from-teal-500 to-cyan-600'
	}
];

function SectionContent({ section }: { section: Section }) {
	switch (section) {
		case 'appearance':
			return <AppearanceSection />;
		case 'audio':
			return <AudioSection />;
		case 'downloads':
			return <DownloadsSection />;
		case 'storage':
			return <StorageSection />;
		case 'account':
			return <AccountSection />;
		case 'privacy':
			return <PrivacySection />;
		case 'notifications':
			return <NotificationsSection />;
		case 'shortcuts':
			return <ShortcutsSection />;
		case 'about':
			return <AboutSection />;
		default:
			return null;
	}
}

export default function Settings() {
	const [active, setActive] = useState<Section | null>(null);
	const meta = SECTIONS.find(s => s.id === active);

	return (
		<div className='flex h-full overflow-hidden'>
			{/* ── Left: section list ────────────────────────────── */}
			<div
				className={cn(
					'flex-shrink-0 w-full lg:w-72 flex flex-col border-r border-[var(--border)]',
					active ? 'hidden lg:flex' : 'flex'
				)}
			>
				<div className='px-5 pt-6 pb-4 flex-shrink-0'>
					<h1 className='text-2xl font-black text-[var(--text-primary)] tracking-tight'>
						Settings
					</h1>
					<p className='text-xs text-[var(--text-muted)] mt-0.5'>
						Shulker v{APP_VERSION}
					</p>
				</div>

				<ScrollArea className='flex-1 px-3 pb-4'>
					<div className='space-y-1'>
						{SECTIONS.map((s, i) => {
							const Icon = s.icon;
							const isActive = active === s.id;
							return (
								<motion.button
									key={s.id}
									initial={{ opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										delay: i * 0.03,
										type: 'spring',
										damping: 24,
										stiffness: 280
									}}
									whileTap={{ scale: 0.975 }}
									onClick={() => setActive(s.id)}
									className={cn(
										'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors duration-150',
										isActive
											? 'bg-[var(--accent-subtle)] border border-[var(--accent-border)]'
											: 'hover:bg-[var(--bg-elevated)] border border-transparent'
									)}
								>
									<div
										className={cn(
											'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br',
											isActive
												? s.color
												: 'from-[var(--bg-elevated)] to-[var(--bg-elevated)]',
											'transition-all duration-200'
										)}
									>
										<Icon
											className={cn(
												'w-[18px] h-[18px]',
												isActive
													? 'text-white'
													: 'text-[var(--text-secondary)]'
											)}
										/>
									</div>
									<div className='min-w-0 flex-1'>
										<p
											className={cn(
												'text-sm font-bold truncate leading-snug',
												isActive
													? 'text-[var(--accent)]'
													: 'text-[var(--text-primary)]'
											)}
										>
											{s.label}
										</p>
										<p className='text-[11px] text-[var(--text-muted)] truncate leading-snug mt-0.5'>
											{s.description}
										</p>
									</div>
									<ChevronLeft
										className={cn(
											'w-3.5 h-3.5 flex-shrink-0 rotate-180 transition-colors',
											isActive
												? 'text-[var(--accent)]'
												: 'text-[var(--text-muted)]'
										)}
									/>
								</motion.button>
							);
						})}
					</div>
				</ScrollArea>
			</div>

			{/* ── Right: section detail ─────────────────────────── */}
			<div
				className={cn(
					'flex-1 min-w-0 flex flex-col overflow-hidden',
					!active ? 'hidden lg:flex' : 'flex'
				)}
			>
				<AnimatePresence mode='wait'>
					{active && meta ? (
						<motion.div
							key={active}
							initial={{ opacity: 0, x: 18 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -10 }}
							transition={{
								type: 'spring',
								damping: 28,
								stiffness: 300
							}}
							className='flex flex-col h-full'
						>
							{/* Sub-header */}
							<div className='flex items-center gap-3 px-4 lg:px-5 pt-5 pb-4 flex-shrink-0 border-b border-[var(--border)]'>
								<button
									onClick={() => setActive(null)}
									className='lg:hidden w-8 h-8 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center active:scale-95 transition-transform flex-shrink-0'
								>
									<ChevronLeft className='w-4 h-4 text-[var(--text-primary)]' />
								</button>
								<div
									className={cn(
										'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br',
										meta.color
									)}
								>
									<meta.icon className='w-[18px] h-[18px] text-white' />
								</div>
								<div className='min-w-0'>
									<h2 className='text-base font-black text-[var(--text-primary)] leading-tight'>
										{meta.label}
									</h2>
									<p className='text-xs text-[var(--text-muted)] truncate'>
										{meta.description}
									</p>
								</div>
							</div>

							<ScrollArea className='flex-1 px-4 lg:px-5 py-5'>
								<SectionContent section={active} />
							</ScrollArea>
						</motion.div>
					) : (
						<motion.div
							key='placeholder'
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							className='hidden lg:flex flex-1 items-center justify-center flex-col gap-4'
						>
							<div className='w-16 h-16 rounded-3xl bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border)]'>
								<ChevronLeft className='w-7 h-7 text-[var(--text-muted)] rotate-180' />
							</div>
							<div className='text-center'>
								<p className='text-[var(--text-primary)] font-bold text-sm'>
									Pick a section
								</p>
								<p className='text-[var(--text-muted)] text-xs mt-1'>
									Configure Shulker from the left
								</p>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
