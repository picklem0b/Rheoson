import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';

import { radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Square artwork, rounded. Covers the loading and missing cases itself.
 *
 * A remote image with no URL renders as its own placeholder colour rather than
 * a broken icon, and `cachePolicy='disk'` keeps a shelf from re-downloading the
 * same covers every time it scrolls back into view.
 */
export function Artwork({
	uri,
	size,
	rounded = radius.md
}: {
	uri?: string | null;
	size: number;
	rounded?: number;
}): ReactElement {
	const { colour } = useTheme();

	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: rounded,
				overflow: 'hidden',
				backgroundColor: colour.surfaceRaised
			}}
		>
			{uri ? (
				<Image
					source={{ uri }}
					style={{ width: size, height: size }}
					contentFit='cover'
					transition={150}
					cachePolicy='disk'
				/>
			) : null}
		</View>
	);
}
