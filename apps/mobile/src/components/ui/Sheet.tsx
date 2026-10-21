import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import {
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	useWindowDimensions,
	View
} from 'react-native';
import {
	Gesture,
	GestureDetector,
	GestureHandlerRootView
} from 'react-native-gesture-handler';
import Animated, {
	Easing,
	interpolate,
	runOnJS,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSpring,
	withTiming
} from 'react-native-reanimated';
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
 * and it can stay open while you do something else.
 *
 * It behaves like the sheets in the apps people already know (Jakob's law):
 * it springs up from the bottom, the scrim fades in step with how far it has
 * travelled, and the grabber area drags it down — past a third of the way or a
 * quick flick and it closes, otherwise it springs back. The backdrop tap and the
 * Android back button both close it too.
 *
 * Mounted state is kept separate from `visible` so the exit animation can play
 * before the native Modal is torn down.
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
	const { height: screenHeight } = useWindowDimensions();
	const reduced = useReducedMotion();

	const [mounted, setMounted] = useState(visible);
	const y = useSharedValue(screenHeight);
	const dragStart = useSharedValue(0);

	useEffect(() => {
		if (visible) {
			setMounted(true);
			y.value = reduced
				? 0
				: withSpring(0, { damping: 24, stiffness: 260, mass: 0.9 });
			return;
		}
		if (!mounted) return;
		if (reduced) {
			y.value = screenHeight;
			setMounted(false);
			return;
		}
		y.value = withTiming(
			screenHeight,
			{ duration: 220, easing: Easing.in(Easing.cubic) },
			finished => {
				if (finished) runOnJS(setMounted)(false);
			}
		);
		// `mounted` is read only to ignore the initial hidden render.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible, reduced, screenHeight]);

	const drag = Gesture.Pan()
		.onBegin(() => {
			dragStart.value = y.value;
		})
		.onUpdate(event => {
			y.value = Math.max(0, dragStart.value + event.translationY);
		})
		.onEnd(event => {
			if (event.translationY > 120 || event.velocityY > 900) {
				runOnJS(onClose)();
			} else {
				y.value = withSpring(0, { damping: 24, stiffness: 300 });
			}
		});

	const panelStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: y.value }]
	}));
	const scrimStyle = useAnimatedStyle(() => ({
		opacity: interpolate(y.value, [0, screenHeight * 0.6], [1, 0], 'clamp')
	}));

	if (!mounted) return <></>;

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
		<View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
			{children}
		</View>
	);

	return (
		<Modal
			visible
			transparent
			animationType='none'
			onRequestClose={onClose}
			statusBarTranslucent
		>
			<GestureHandlerRootView style={{ flex: 1, justifyContent: 'flex-end' }}>
				<Animated.View
					pointerEvents='none'
					style={[
						StyleSheet.absoluteFill,
						{ backgroundColor: colour.overlay },
						scrimStyle
					]}
				/>
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={onClose}
					accessibilityLabel='Close'
					accessibilityRole='button'
				/>
				<Animated.View
					style={[
						{
							backgroundColor: colour.surfaceRaised,
							borderTopLeftRadius: radius.xl + 6,
							borderTopRightRadius: radius.xl + 6,
							borderTopWidth: StyleSheet.hairlineWidth,
							borderColor: colour.borderStrong,
							maxHeight: '90%',
							paddingBottom: Math.max(insets.bottom, spacing.md)
						},
						panelStyle
					]}
				>
					<GestureDetector gesture={drag}>
						<View collapsable={false}>
							<View
								style={{
									alignItems: 'center',
									paddingTop: spacing.sm + 2,
									paddingBottom: spacing.xs
								}}
							>
								<View
									style={{
										width: 40,
										height: 5,
										borderRadius: 3,
										backgroundColor: colour.borderStrong
									}}
								/>
							</View>
							{title ? (
								<View
									style={{
										paddingHorizontal: spacing.lg,
										paddingTop: spacing.sm
									}}
								>
									<Text variant='heading' numberOfLines={1}>
										{title}
									</Text>
								</View>
							) : null}
						</View>
					</GestureDetector>
					<View style={{ paddingTop: spacing.sm }}>{content}</View>
					{footer ? (
						<View style={{ paddingHorizontal: spacing.lg }}>{footer}</View>
					) : null}
				</Animated.View>
			</GestureHandlerRootView>
		</Modal>
	);
}
