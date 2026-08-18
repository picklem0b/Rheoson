import { useState, useEffect } from 'react';
import {
	Music2,
	ExternalLink,
	Github,
	Star,
	GitFork,
	Eye,
	Tag
} from 'lucide-react';
import { APP_VERSION } from '@/lib/constants';
import { SettingsGroup, SettingsRow } from '../components/SettingsPrimitives';
import { cn } from '@/lib/utils';

const GITHUB = 'https://github.com/picklem0b/shulker';

const STACK = [
	{ label: 'yt-dlp', value: '2026.3.17' },
	{ label: 'ytmusicapi', value: '1.12.0' },
	{ label: 'FastAPI', value: '0.103+' },
	{ label: 'React', value: '18.3' },
	{ label: 'Framer Motion', value: '11' },
	{ label: 'Howler.js', value: '2.2.4' },
	{ label: 'Zustand', value: '4.5' }
];

const TAGS = ['v1.0.0', 'v1.1.0', 'v1.2.0', 'v1.3.0', `v${APP_VERSION}`];

export default function AboutSection() {
	const [ghStats, setGhStats] = useState<{
		stars: number;
		forks: number;
		watchers: number;
	} | null>(null);

	useEffect(() => {
		fetch('https://api.github.com/repos/picklem0b/shulker')
			.then(r => r.json())
			.then(d =>
				setGhStats({
					stars: d.stargazers_count,
					forks: d.forks_count,
					watchers: d.watchers_count
				})
			)
			.catch(() => {});
	}, []);

	return (
		<div className='pb-2'>
			{/* App hero */}
			<div className='mb-6 rounded-3xl overflow-hidden bg-gradient-to-br from-[var(--accent)]/10 to-[var(--bg-surface)] border border-[var(--border)]'>
				<div className='flex items-center gap-4 px-5 py-5'>
					<div className='w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center shadow-lg flex-shrink-0'>
						<Music2 className='w-7 h-7 text-white' />
					</div>
					<div className='min-w-0'>
						<p className='font-black text-[var(--text-primary)] text-xl tracking-tight leading-tight'>
							Shulker
						</p>
						<p className='text-sm text-[var(--text-muted)]'>
							v{APP_VERSION} · Built by LethaboK
						</p>
						<p className='text-xs text-[var(--text-muted)] mt-0.5'>
							Built on Termux · Deployed on Render
						</p>
					</div>
				</div>

				{ghStats && (
					<div className='flex border-t border-[var(--border)] divide-x divide-[var(--border)]'>
						{[
							{
								icon: Star,
								label: 'Stars',
								value: ghStats.stars
							},
							{
								icon: GitFork,
								label: 'Forks',
								value: ghStats.forks
							},
							{
								icon: Eye,
								label: 'Watchers',
								value: ghStats.watchers
							}
						].map(({ icon: Icon, label, value }) => (
							<div
								key={label}
								className='flex-1 flex flex-col items-center py-3.5 gap-0.5'
							>
								<Icon className='w-4 h-4 text-[var(--accent)]' />
								<span className='text-sm font-bold text-[var(--text-primary)]'>
									{value}
								</span>
								<span className='text-[10px] text-[var(--text-muted)]'>
									{label}
								</span>
							</div>
						))}
					</div>
				)}
			</div>

			<SettingsGroup title='Release tags'>
				<div className='px-4 py-3.5 flex flex-wrap gap-2'>
					{TAGS.map(tag => (
						<button
							key={tag}
							onClick={() =>
								window.open(
									`${GITHUB}/releases/tag/${tag}`,
									'_blank'
								)
							}
							className={cn(
								'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
								tag === `v${APP_VERSION}`
									? 'bg-[var(--accent)] text-white border-[var(--accent)]'
									: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent)]'
							)}
						>
							<Tag className='w-3 h-3' />
							{tag}
						</button>
					))}
				</div>
			</SettingsGroup>

			<SettingsGroup title='Stack'>
				{STACK.map(d => (
					<SettingsRow key={d.label} label={d.label}>
						<span className='text-xs text-[var(--text-muted)] font-mono'>
							{d.value}
						</span>
					</SettingsRow>
				))}
			</SettingsGroup>

			<SettingsGroup title='Links'>
				<SettingsRow
					label='GitHub'
					description='picklem0b/shulker'
					onClick={() => window.open(GITHUB, '_blank')}
				>
					<Github className='w-4 h-4 text-[var(--text-muted)]' />
				</SettingsRow>
				<SettingsRow
					label='Report a bug'
					onClick={() =>
						window.open(
							`${GITHUB}/issues/new?template=bug_report.md`,
							'_blank'
						)
					}
				>
					<ExternalLink className='w-4 h-4 text-[var(--text-muted)]' />
				</SettingsRow>
				<SettingsRow
					label='Request a feature'
					onClick={() =>
						window.open(
							`${GITHUB}/issues/new?template=feature_request.md`,
							'_blank'
						)
					}
				>
					<ExternalLink className='w-4 h-4 text-[var(--text-muted)]' />
				</SettingsRow>
			</SettingsGroup>
		</div>
	);
}
