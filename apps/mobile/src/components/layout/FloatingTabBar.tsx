import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring
} from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import {
	DownloadSimpleIcon,
	HouseIcon,
	MagnifyingGlassIcon,
	MusicNotesIcon
} from 'phosphor-react-native';

import { PressableScale } from '@/components/motion';
import { Text } from '@/components/ui';
import { motion, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useChromeStore } from '@/store/chrome.store';

const BAR_HEIGHT = 64;
const INSET = 4;

const ICONS = {
	index: HouseIcon,
	search: MagnifyingGlassIcon,
	library: MusicNotesIcon,
	downloads: DownloadSimpleIcon
} as const;

type RouteName = keyof typeof ICONS;

const LABELS: Record<RouteName, string> = {
	index: 'Home',
	search: 'Search',
	library: 'Library',
	downloads: 'Downloads'
};

/**
 * The floating tab bar — the website's `BottomNav` pill, for the phone.
 *
 * A glass capsule floats above the content with a hairline border; the active
 * destination is marked by a tinted pill that *slides* from tab to tab on a
 * spring rather than switching, which is what makes the four rooms feel like one
 * connected space instead of four screens. The icon fills and lifts slightly on
 * the active tab, and the label colour fades.
 *
 * It measures its own height (bottom inset included) into the chrome store so
 * the mini player can float directly above it on any device.
 */
export function FloatingTabBar({
	state,
	navigation,
	descriptors,
	badges
}: BottomTabBarProps & {
	badges?: Partial<Record<string, number>>;
}): ReactElement {
	const { colour } = useTheme();
	const insets = useSafeAreaInsets();
	const setTabBarHeight = useChromeStore(store => store.setTabBarHeight);
	const [width, setWidth] = useState(0);

	const count = state.routes.length;
	const tabWidth = width > 0 ? (width - INSET * 2) / count : 0;

	const x = useSharedValue(0);
	useEffect(() => {
		x.value = withSpring(state.index * tabWidth, {
			damping: 20,
			stiffness: 280,
			mass: 0.8
		});
	}, [state.index, tabWidth, x]);

	const indicator = useAnimatedStyle(() => ({
		transform: [{ translateX: x.value }]
	}));

	return (
		<View
			onLayout={event => setTabBarHeight(event.nativeEvent.layout.height)}
			style={{
				paddingHorizontal: spacing.lg,
				paddingTop: spacing.sm,
				paddingBottom: Math.max(insets.bottom, spacing.md),
				backgroundColor: colour.background
			}}
		>
			<View
				onLayout={event => setWidth(event.nativeEvent.layout.width)}
				style={{
					height: BAR_HEIGHT,
					borderRadius: radius.pill,
					backgroundColor: colour.glass,
					borderWidth: StyleSheet.hairlineWidth,
					borderColor: colour.glassBorder,
					flexDirection: 'row',
					padding: INSET
				}}
			>
				{tabWidth > 0 ? (
					<Animated.View
						pointerEvents='none'
						style={[
							{
								position: 'absolute',
								left: INSET,
								top: INSET,
								bottom: INSET,
								width: tabWidth,
								borderRadius: radius.pill,
								backgroundColor: colour.accentSubtle,
								borderWidth: StyleSheet.hairlineWidth,
								borderColor: colour.accentBorder
							},
							indicator
						]}
					/>
				) : null}

				{state.routes.map((route, index) => {
					const name = route.name as RouteName;
					const Icon = ICONS[name];
					if (!Icon) return null;

					const focused = state.index === index;
					const badge = badges?.[route.name];
					const label = LABELS[name];

					const onPress = (): void => {
						const event = navigation.emit({
							type: 'tabPress',
							target: route.key,
							canPreventDefault: true
						});
						if (!focused && !event.defaultPrevented) {
							navigation.navigate(route.name, route.params);
						}
					};

					return (
						<PressableScale
							key={route.key}
							onPress={onPress}
							onLongPress={() =>
								navigation.emit({ type: 'tabLongPress', target: route.key })
							}
							to={0.9}
							accessibilityRole='tab'
							accessibilityLabel={
								descriptors[route.key]?.options.tabBarAccessibilityLabel ??
								label
							}
							accessibilityState={{ selected: focused }}
							style={{
								flex: 1,
								alignItems: 'center',
								justifyContent: 'center',
								gap: 3
							}}
						>
							<MotiView
								animate={{
									scale: focused ? 1.1 : 1,
									translateY: focused ? -1 : 0
								}}
								transition={motion.bounce}
							>
								<Icon
									size={23}
									color={focused ? colour.accent : colour.textMuted}
									weight={focused ? 'fill' : 'regular'}
								/>
								{badge && badge > 0 ? (
									<MotiView
										from={{ scale: 0 }}
										animate={{ scale: 1 }}
										transition={motion.bounce}
										style={{
											position: 'absolute',
											top: -5,
											right: -9,
											minWidth: 16,
											height: 16,
											borderRadius: 8,
											paddingHorizontal: 4,
											alignItems: 'center',
											justifyContent: 'center',
											backgroundColor: colour.accent
										}}
									>
										<Text
											variant='micro'
											style={{
												color: colour.onAccent,
												fontSize: 9,
												letterSpacing: 0
											}}
										>
											{badge > 9 ? '9+' : badge}
										</Text>
									</MotiView>
								) : null}
							</MotiView>
							<Text
								variant='micro'
								style={{
									color: focused ? colour.accent : colour.textMuted,
									fontSize: 10,
									letterSpacing: 0.2
								}}
							>
								{label}
							</Text>
						</PressableScale>
					);
				})}
			</View>
		</View>
	);
}
