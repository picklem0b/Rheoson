import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeftIcon } from 'phosphor-react-native';

import { IconButton, Text } from '@/components/ui';
import { layout, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The top of a detail screen: back, a small title, and room for one action.
 *
 * A detail page is reached from somewhere, so the back control is on the left
 * exactly where Android's gesture and button both expect it. The title is small
 * on purpose — the page's real title is in the hero below, and two competing
 * large titles is how a screen looks like a browser.
 */
export function BackBar({
	title,
	action
}: {
	title: string;
	action?: ReactNode;
}): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();

	return (
		<View
			style={{
				height: layout.header,
				flexDirection: 'row',
				alignItems: 'center',
				gap: spacing.xs
			}}
		>
			<IconButton
				label='Go back'
				onPress={() => {
					if (router.canGoBack()) router.back();
					else router.replace('/(tabs)/library');
				}}
			>
				<ArrowLeftIcon size={22} color={colour.text} />
			</IconButton>
			<Text variant='label' numberOfLines={1} style={{ flex: 1 }}>
				{title}
			</Text>
			{action}
		</View>
	);
}
