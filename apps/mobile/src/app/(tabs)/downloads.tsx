import { useState, type ReactElement, type ReactNode } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowClockwiseIcon, PlusIcon, XIcon } from 'phosphor-react-native';

import { type DownloadJob } from '@/api/downloads.api';
import {
	AppBar,
	Button,
	EmptyState,
	ErrorState,
	Field,
	IconButton,
	ProgressBar,
	SectionHeader,
	Sheet,
	Skeleton,
	Text
} from '@/components/ui';
import { layout, radius, spacing } from '@/constants/theme';
import { useDownloadActions } from '@/hooks/use-download-actions';
import { useDownloads } from '@/hooks/use-downloads';
import { useTheme } from '@/hooks/use-theme';
import { humanError } from '@/lib/errors';
import { formatFileSize } from '@/lib/formatters';

/**
 * The transfer manager.
 *
 * Downloads are performed by the server — yt-dlp runs there, into the server's
 * music folder — so this screen is a job monitor, not a file browser. Saying so
 * plainly matters: "downloaded" here means "available to every client", not
 * "on this phone", and the empty state explains that instead of pretending the
 * feature is local.
 *
 * Progress arrives over the socket and falls back to polling, so a job started
 * before the app was killed still appears, with the numbers it reached.
 */
export default function DownloadsScreen(): ReactElement {
	const { colour } = useTheme();
	const { jobs, active, finished, failed, isLoading, error, refetch } = useDownloads();
	const actions = useDownloadActions();

	const [adding, setAdding] = useState(false);
	const [url, setUrl] = useState('');

	const confirmDelete = (job: DownloadJob): void => {
		Alert.alert(
			'Delete this download?',
			`The file for “${job.title}” is removed from the server's music folder. Other clients lose it too.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{ text: 'Delete', style: 'destructive', onPress: () => actions.remove(job.id) }
			]
		);
	};

	const submitUrl = (): void => {
		const trimmed = url.trim();
		if (!trimmed) return;
		void actions.startFromUrl(trimmed).then(result => {
			if (result) {
				setAdding(false);
				setUrl('');
			}
		});
	};

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
			<ScrollView
				contentContainerStyle={{
					paddingHorizontal: spacing.lg,
					paddingBottom: layout.miniPlayer + layout.tabBar + spacing.xxl,
					gap: spacing.md
				}}
				showsVerticalScrollIndicator={false}
			>
				<AppBar
					title='Downloads'
					subtitle={active.length > 0 ? `${active.length} in progress` : 'The server fetches, every device plays'}
					action={
						<IconButton label='Download by link' onPress={() => setAdding(true)}>
							<PlusIcon size={22} color={colour.text} />
						</IconButton>
					}
				/>

				{isLoading ? (
					<View style={{ gap: spacing.sm }}>
						<Skeleton height={72} />
						<Skeleton height={72} />
					</View>
				) : null}

				{error ? (
					<ErrorState message={humanError(error)} onRetry={() => void refetch()} />
				) : null}

				{!isLoading && !error && jobs.length === 0 ? (
					<EmptyState
						title='Nothing downloading'
						message='Downloads run on your server and land in its music folder, so they are available here and on the web. Start one from any track menu, or paste a link.'
						action={<Button label='Paste a link' onPress={() => setAdding(true)} />}
					/>
				) : null}

				{active.length > 0 ? (
					<>
						<SectionHeader title='In progress' />
						{active.map(job => (
							<JobCard key={job.id} job={job}>
								<IconButton label={`Cancel ${job.title}`} onPress={() => actions.cancel(job.id)}>
									<XIcon size={18} color={colour.textMuted} />
								</IconButton>
							</JobCard>
						))}
					</>
				) : null}

				{failed.length > 0 ? (
					<>
						<SectionHeader title='Needs attention' />
						{failed.map(job => (
							<JobCard key={job.id} job={job}>
								<View style={{ flexDirection: 'row' }}>
									<IconButton
										label={`Retry ${job.title}`}
										onPress={() => actions.retry(job.id, job.resumable ? true : undefined)}
									>
										<ArrowClockwiseIcon size={18} color={colour.text} />
									</IconButton>
									<IconButton label={`Remove ${job.title}`} onPress={() => confirmDelete(job)}>
										<XIcon size={18} color={colour.textMuted} />
									</IconButton>
								</View>
							</JobCard>
						))}
					</>
				) : null}

				{finished.length > 0 ? (
					<>
						<SectionHeader title='Finished' />
						{finished.map(job => (
							<JobCard key={job.id} job={job}>
								<IconButton label={`Delete ${job.title}`} onPress={() => confirmDelete(job)}>
									<XIcon size={18} color={colour.textMuted} />
								</IconButton>
							</JobCard>
						))}
					</>
				) : null}
			</ScrollView>

			<Sheet
				visible={adding}
				onClose={() => {
					setAdding(false);
					setUrl('');
				}}
				title='Download by link'
			>
				<View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
					<Text variant='caption' muted>
						Paste a YouTube Music, Spotify or YouTube link. The server resolves it and downloads the
						audio.
					</Text>
					<Field
						value={url}
						onChangeText={setUrl}
						placeholder='https://…'
						keyboardType='url'
						autoFocus
						onSubmitEditing={submitUrl}
					/>
					<Button label='Start download' disabled={!url.trim()} onPress={submitUrl} />
				</View>
			</Sheet>
		</SafeAreaView>
	);
}

const STATUS_LABEL: Record<DownloadJob['status'], string> = {
	queued: 'Queued',
	downloading: 'Downloading',
	converting: 'Converting',
	done: 'Downloaded',
	failed: 'Failed',
	cancelled: 'Cancelled'
};

function JobCard({
	job,
	children
}: {
	job: DownloadJob;
	children: ReactNode;
}): ReactElement {
	const { colour } = useTheme();
	const progress = Math.max(0, Math.min(100, job.progress ?? 0));
	const ratio = job.status === 'done' ? 1 : progress / 100;
	const tone = job.status === 'failed' || job.status === 'cancelled' ? 'danger' : 'accent';

	const detail = [
		job.status === 'downloading' ? `${Math.round(progress)}%` : STATUS_LABEL[job.status],
		job.speed,
		job.eta ? `${job.eta} left` : undefined,
		job.status === 'failed' && job.resumable && job.stagedBytes
			? `${formatFileSize(job.stagedBytes)} saved`
			: undefined
	]
		.filter(Boolean)
		.join(' · ');

	return (
		<View
			style={{
				backgroundColor: colour.surface,
				borderRadius: radius.lg,
				borderWidth: 0.5,
				borderColor: colour.border,
				padding: spacing.md,
				gap: spacing.sm
			}}
		>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
				<View style={{ flex: 1 }}>
					<Text variant='bodyStrong' numberOfLines={1}>
						{job.title || 'Untitled'}
					</Text>
					{job.artist ? (
						<Text variant='caption' muted numberOfLines={1}>
							{job.artist}
						</Text>
					) : null}
				</View>
				{children}
			</View>

			<ProgressBar ratio={ratio} tone={tone} />

			<Text variant='caption' muted numberOfLines={2}>
				{detail}
				{job.error ? `\n${job.error}` : ''}
			</Text>
		</View>
	);
}
