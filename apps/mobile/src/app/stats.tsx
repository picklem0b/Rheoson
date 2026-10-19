import type { ReactElement } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CaretRightIcon } from 'phosphor-react-native';

import { analyticsApi } from '@/api/analytics.api';
import { tracksApi } from '@/api/tracks.api';
import { BackBar } from '@/components/layout/BackBar';
import {
	Artwork,
	EmptyState,
	ErrorState,
	ListRow,
	SectionHeader,
	Skeleton,
	Text
} from '@/components/ui';
import { layout, radius, spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { humanError } from '@/lib/errors';
import { formatCount } from '@/lib/formatters';
import { qk } from '@/lib/queryKeys';
import type { Track } from '@rheoson/api-types';

/**
 * Listening stats.
 *
 * The numbers are the server's, and they are what they say: play counts and an
 * *estimated* listening time, because a play signal records that a track
 * started, not how long it ran. Saying "estimated" next to the hours is the
 * difference between a stat and a lie.
 *
 * Charts are plain Views rather than a chart library. Two bar charts of 24 and
 * 7 values do not justify a dependency, and this way they take the theme's
 * colours and the screen reader's labels for free.
 */
export default function StatsScreen(): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();
	const { width } = useWindowDimensions();
	const { playTrack } = usePlayback();

	const summary = useQuery({ queryKey: qk.analyticsStats(), queryFn: analyticsApi.stats });
	const topTracks = useQuery({ queryKey: qk.analyticsTopTracks(), queryFn: () => analyticsApi.topTracks(30, 10) });
	const topArtists = useQuery({ queryKey: qk.analyticsTopArtists(), queryFn: () => analyticsApi.topArtists(30, 10) });
	const byHour = useQuery({ queryKey: qk.analyticsByHour(), queryFn: () => analyticsApi.listeningByHour(30) });
	const byDay = useQuery({ queryKey: qk.analyticsByDay(), queryFn: () => analyticsApi.listeningByDay(7) });
	const library = useQuery({ queryKey: qk.libraryTracks(), queryFn: () => tracksApi.list() });

	const known = new Map<string, Track>((library.data ?? []).map(track => [track.id, track]));
	const played = (topTracks.data ?? [])
		.map(item => ({ plays: item.plays, track: known.get(item.trackId) }))
		.filter((item): item is { plays: number; track: Track } => Boolean(item.track));

	const loading = summary.isLoading;
	const error = summary.error;

	const hours = summary.data?.estimatedListeningHours ?? 0;
	const cardWidth = (width - spacing.lg * 2 - spacing.sm) / 2;

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
			<ScrollView
				contentContainerStyle={{
					paddingHorizontal: spacing.lg,
					paddingBottom: layout.tabBar + spacing.xxl,
					gap: spacing.md
				}}
				showsVerticalScrollIndicator={false}
			>
				<BackBar title='Listening stats' />

				{loading ? (
					<View style={{ gap: spacing.sm }}>
						<Skeleton height={120} />
						<Skeleton height={90} />
						<Skeleton height={150} />
					</View>
				) : null}

				{error ? (
					<ErrorState message={humanError(error)} onRetry={() => void summary.refetch()} />
				) : null}

				{summary.data ? (
					<>
						<View
							style={{
								backgroundColor: colour.surface,
								borderRadius: radius.lg,
								borderWidth: 0.5,
								borderColor: colour.border,
								padding: spacing.xl,
								alignItems: 'center',
								gap: spacing.xs
							}}
						>
							<Text variant='display'>{hours < 1 ? '<1' : Math.round(hours)}</Text>
							<Text variant='caption' muted>
								estimated hours listened
							</Text>
							<Text variant='caption' muted>
								{summary.data.totalPlays} plays · {summary.data.plays30d} in the last 30 days
							</Text>
						</View>

						<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
							<StatCard width={cardWidth} label='Artists' value={formatCount(summary.data.uniqueArtists30d)} />
							<StatCard width={cardWidth} label='Active days' value={String(summary.data.activeDays30d)} />
							<StatCard width={cardWidth} label='Current streak' value={`${summary.data.currentStreak}d`} />
							<StatCard width={cardWidth} label='Longest streak' value={`${summary.data.longestStreak}d`} />
						</View>

						{summary.data.totalPlays === 0 ? (
							<EmptyState
								title='No plays yet'
								message='Play something and this page fills in. Stats are per account, so they follow you to the web too.'
							/>
						) : null}

						{byDay.data && byDay.data.some(item => item.plays > 0) ? (
							<>
								<SectionHeader title='By day of week' />
								<Bars
									values={byDay.data.map(item => item.plays)}
									labels={byDay.data.map(item => item.day)}
									labelEvery={1}
								/>
							</>
						) : null}

						{byHour.data && byHour.data.some(item => item.plays > 0) ? (
							<>
								<SectionHeader title='By hour of day' />
								<Bars
									values={byHour.data.map(item => item.plays)}
									labels={byHour.data.map(item => String(item.hour))}
									labelEvery={6}
								/>
							</>
						) : null}

						{played.length > 0 ? (
							<>
								<SectionHeader title='Top tracks · 30 days' />
								{played.map((item, index) => (
									<ListRow
										key={`${item.track.id}-${index}`}
										title={item.track.title}
										subtitle={`${item.track.artist?.name ?? 'Unknown artist'} · ${item.plays} plays`}
										leading={<Artwork uri={item.track.artworkUrl} size={44} />}
										onPress={() =>
											playTrack(
												item.track,
												played.map(entry => entry.track),
												'Top tracks'
											)
										}
									/>
								))}
							</>
						) : null}

						{(topArtists.data?.length ?? 0) > 0 ? (
							<>
								<SectionHeader title='Top artists · 30 days' />
								{topArtists.data?.map(item => (
									<ListRow
										key={item.name}
										title={item.name}
										subtitle={`${item.plays} ${item.plays === 1 ? 'play' : 'plays'}`}
										trailing={<CaretRightIcon size={18} color={colour.textMuted} />}
										onPress={() =>
											router.push({
												pathname: '/artist/[id]',
												params: { id: slug(item.name), name: item.name }
											})
										}
									/>
								))}
							</>
						) : null}

						<Text variant='caption' muted>
							Hours are estimated from play counts. Signals are recorded when a track starts.
						</Text>
					</>
				) : null}
			</ScrollView>
		</SafeAreaView>
	);
}

function StatCard({ label, value, width }: { label: string; value: string; width: number }): ReactElement {
	const { colour } = useTheme();
	return (
		<View
			style={{
				width,
				backgroundColor: colour.surface,
				borderRadius: radius.md,
				borderWidth: 0.5,
				borderColor: colour.border,
				padding: spacing.md,
				gap: 2
			}}
		>
			<Text variant='heading'>{value}</Text>
			<Text variant='caption' muted>
				{label}
			</Text>
		</View>
	);
}

function Bars({
	values,
	labels,
	labelEvery
}: {
	values: number[];
	labels: string[];
	labelEvery: number;
}): ReactElement {
	const { colour } = useTheme();
	const max = Math.max(1, ...values);

	return (
		<View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 96 }}>
			{values.map((value, index) => (
				<View key={`${labels[index]}-${index}`} style={{ flex: 1, alignItems: 'center', gap: spacing.xs }}>
					<View
						style={{
							width: '100%',
							height: Math.max(2, (value / max) * 64),
							borderRadius: 3,
							backgroundColor: value > 0 ? colour.accent : colour.surfaceRaised
						}}
						accessibilityLabel={`${labels[index]}: ${value} plays`}
					/>
					{index % labelEvery === 0 ? (
						<Text variant='micro' muted style={{ fontSize: 9 }}>
							{labels[index]}
						</Text>
					) : (
						<View style={{ height: 11 }} />
					)}
				</View>
			))}
		</View>
	);
}

/** The server matches a local artist by slug when it has no browse id. */
function slug(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
