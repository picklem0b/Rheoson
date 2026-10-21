import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { MusicNotesIcon } from 'phosphor-react-native';

import { radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Square artwork, rounded. Covers the loading and missing cases itself.
 *
 * With no URL — or while one loads — the tile shows a quiet music glyph on the
 * raised surface instead of a blank square or a broken icon, so a shelf of
 * covers that have not arrived yet still reads as a shelf of albums.
 * `cachePolicy='disk'` keeps a shelf from re-downloading the same covers every
 * time it scrolls back into view, and the 220ms fade-in stops covers popping.
 *
 * `elevated` adds the soft drop shadow used under hero artwork. Shadows are
 * reserved for that one case: on a dark screen everywhere else, elevation is a
 * lighter surface, not a smudge.
 */
export function Artwork({
	uri,
	size,
	rounded = radius.md,
	elevated = false
}: {
	uri?: string | null;
	size: number;
	rounded?: number;
	elevated?: boolean;
}): ReactElement {
	const { colour } = useTheme();

	return (
		<View
			style={[
				{
					width: size,
					height: size,
					borderRadius: rounded,
					backgroundColor: colour.surfaceRaised
				},
				elevated
					? {
							shadowColor: '#000',
							shadowOpacity: 0.45,
							shadowRadius: 24,
							shadowOffset: { width: 0, height: 14 },
							elevation: 18
						}
					: null
			]}
		>
			<View
				style={[
					StyleSheet.absoluteFill,
					{ alignItems: 'center', justifyContent: 'center' }
				]}
				pointerEvents='none'
			>
				<MusicNotesIcon
					size={Math.max(14, size * 0.34)}
					color={colour.textFaint}
					weight='duotone'
				/>
			</View>
			<View
				style={{
					width: size,
					height: size,
					borderRadius: rounded,
					overflow: 'hidden'
				}}
			>
				{uri ? (
					<Image
						source={{ uri }}
						recyclingKey={uri}
						style={{ width: size, height: size }}
						contentFit='cover'
						transition={220}
						cachePolicy='disk'
					/>
				) : null}
			</View>
		</View>
	);
}
