import type { ReactElement, ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './Text';

/**
 * A bottom sheet.
 *
 * Everything that used to be an `Alert` — the track menu, the queue, "new
 * playlist", the download-by-URL field — is this instead. An alert can hold one
 * line of text and two buttons; a sheet holds a list, a text field, artwork,
 * and it can stay open while you do something else. It is also the shape people
 * expect from the bottom of a phone.
 *
 * Dismissal is deliberate: the backdrop is tappable and the Android back button
 * is wired to `onClose`, which is the behaviour `Alert` had and the reason a
 * sheet that ignores the back button feels broken.
 */
export function Sheet({
	visible,
	onClose,
	title,
	children,
	scroll = false,
	footer
}: {
	visible: boolean;
	onClose: () => void;
	title?: string;
	children: ReactNode;
	scroll?: boolean;
	footer?: ReactNode;
}): ReactElement {
	const { colour } = useTheme();
	const insets = useSafeAreaInsets();

	const content = scroll ? (
		<ScrollView
			style={{ flexGrow: 0 }}
			contentContainerStyle={{
				paddingHorizontal: spacing.lg,
				paddingBottom: spacing.md,
				gap: spacing.xs
			}}
			showsVerticalScrollIndicator={false}
			keyboardShouldPersistTaps='handled'
		>
			{children}
		</ScrollView>
	) : (
		<View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>{children}</View>
	);

	return (
		<Modal
			visible={visible}
			transparent
			animationType='slide'
			onRequestClose={onClose}
			statusBarTranslucent
		>
			<View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colour.overlay }}>
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={onClose}
					accessibilityLabel='Close'
					accessibilityRole='button'
				/>
				<View
					style={{
						backgroundColor: colour.surface,
						borderTopLeftRadius: radius.xl,
						borderTopRightRadius: radius.xl,
						borderTopWidth: StyleSheet.hairlineWidth,
						borderColor: colour.border,
						maxHeight: '90%',
						paddingBottom: Math.max(insets.bottom, spacing.md)
					}}
				>
					<View style={{ alignItems: 'center', paddingTop: spacing.sm }}>
						<View
							style={{
								width: 40,
								height: 4,
								borderRadius: 2,
								backgroundColor: colour.borderStrong
							}}
						/>
					</View>
					{title ? (
						<View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
							<Text variant='heading' numberOfLines={1}>
								{title}
							</Text>
						</View>
					) : null}
					<View style={{ paddingTop: spacing.sm }}>{content}</View>
					{footer ? <View style={{ paddingHorizontal: spacing.lg }}>{footer}</View> : null}
				</View>
			</View>
		</Modal>
	);
}
