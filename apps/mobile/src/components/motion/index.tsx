/**
 * The app's motion layer.
 *
 * The website animates with Framer Motion. Framer Motion renders to the DOM and
 * cannot run in React Native, so the phone uses Moti — the same declarative
 * `from` / `animate` / `exit` / `transition` model, driven by Reanimated on the
 * UI thread. Anything below that reads like Framer Motion on the web does the
 * same thing here.
 *
 * Three rules keep motion from turning into noise:
 *
 *  * **Frequency-gated.** Things people do hundreds of times (play, pause, skip)
 *    respond in a few frames. Things that happen once per screen (a reveal) get
 *    the slow, soft curve.
 *  * **Physical.** Presses give a little and spring back; nothing moves linearly
 *    except a progress bar, which really is linear.
 *  * **Optional.** With the OS's "reduce motion" on, reveals and loops render
 *    their final state immediately. Motion is decoration; content never waits
 *    for it.
 */
import { useEffect, type ReactElement, type ReactNode } from 'react';
import {
	Pressable,
	View,
	type PressableProps,
	type StyleProp,
	type ViewStyle
} from 'react-native';
import Animated, {
	Easing,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSpring,
	withTiming
} from 'react-native-reanimated';
import { AnimatePresence, MotiView } from 'moti';

import { motion, radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export { AnimatePresence, MotiView };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** True when the OS asks for less motion. */
export function useReducedMotionPreference(): boolean {
	return useReducedMotion();
}

/**
 * Fade-and-rise on mount. `index` staggers siblings, capped so the tenth row of
 * a long list does not appear a full second after the first.
 */
export function Reveal({
	children,
	index = 0,
	distance = 14,
	style
}: {
	children: ReactNode;
	index?: number;
	/** Vertical travel in dp; negative enters from above. */
	distance?: number;
	style?: StyleProp<ViewStyle>;
}): ReactElement {
	const reduced = useReducedMotionPreference();
	if (reduced) return <View style={style}>{children}</View>;

	const delay =
		Math.min(Math.max(index, 0), motion.staggerCap) * motion.stagger;
	return (
		<MotiView
			from={{ opacity: 0, translateY: distance }}
			animate={{ opacity: 1, translateY: 0 }}
			transition={{
				type: 'timing',
				duration: motion.duration.slow,
				delay,
				easing: Easing.out(Easing.cubic)
			}}
			style={style}
		>
			{children}
		</MotiView>
	);
}

/** Scale-and-fade pop, for things that arrive rather than slide in. */
export function Pop({
	children,
	delay = 0,
	style
}: {
	children: ReactNode;
	delay?: number;
	style?: StyleProp<ViewStyle>;
}): ReactElement {
	const reduced = useReducedMotionPreference();
	if (reduced) return <View style={style}>{children}</View>;

	return (
		<MotiView
			from={{ opacity: 0, scale: 0.88 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ ...motion.bounce, delay }}
			style={style}
		>
			{children}
		</MotiView>
	);
}

/**
 * A pressable that gives under the finger.
 *
 * `to` is how far it shrinks: 0.97 for a row, 0.92 for a small icon button,
 * 0.96 for a card. The spring is stiff so it never feels like it is lagging
 * behind the touch.
 */
export function PressableScale({
	children,
	style,
	to = 0.97,
	disabled,
	onPressIn,
	onPressOut,
	...rest
}: Omit<PressableProps, 'style' | 'children'> & {
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
	to?: number;
}): ReactElement {
	const scale = useSharedValue(1);
	const reduced = useReducedMotionPreference();

	const animated = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }]
	}));

	return (
		<AnimatedPressable
			{...rest}
			disabled={disabled}
			onPressIn={event => {
				if (!reduced) scale.value = withSpring(to, motion.press);
				onPressIn?.(event);
			}}
			onPressOut={event => {
				if (!reduced) scale.value = withSpring(1, motion.press);
				onPressOut?.(event);
			}}
			style={[style, animated]}
		>
			{children}
		</AnimatedPressable>
	);
}

/**
 * A progress fill that glides to its next value.
 *
 * The player reports position twice a second; setting the width directly would
 * make the bar tick. A linear timing of the same length turns the ticks into
 * continuous motion, which is what position actually is.
 */
export function SmoothFill({
	ratio,
	height,
	color,
	duration = 500
}: {
	ratio: number;
	height: number;
	color: string;
	duration?: number;
}): ReactElement {
	const safe = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
	const value = useSharedValue(safe);
	const reduced = useReducedMotionPreference();

	useEffect(() => {
		value.value = reduced
			? safe
			: withTiming(safe, { duration, easing: Easing.linear });
	}, [safe, duration, reduced, value]);

	const style = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));
	return <Animated.View style={[{ height, backgroundColor: color }, style]} />;
}

/** A placeholder that breathes while content is on its way. */
export function Shimmer({
	height = 16,
	width = '100%',
	rounded = radius.sm,
	style
}: {
	height?: number;
	width?: number | `${number}%`;
	rounded?: number;
	style?: StyleProp<ViewStyle>;
}): ReactElement {
	const { colour } = useTheme();
	const reduced = useReducedMotionPreference();

	const base: ViewStyle = {
		height,
		width,
		borderRadius: rounded,
		backgroundColor: colour.skeleton
	};
	if (reduced) return <View style={[base, style]} />;

	return (
		<MotiView
			from={{ opacity: 0.55 }}
			animate={{ opacity: 1 }}
			transition={{
				type: 'timing',
				duration: 850,
				loop: true,
				easing: Easing.inOut(Easing.quad)
			}}
			style={[base, style]}
		/>
	);
}

/**
 * Three bars that dance while audio plays and settle when it stops — the
 * universal "this is the one that's playing" mark.
 */
export function EqBars({
	playing,
	color,
	size = 14
}: {
	playing: boolean;
	color: string;
	size?: number;
}): ReactElement {
	const reduced = useReducedMotionPreference();
	const bars = [
		{ duration: 420, low: 0.35 },
		{ duration: 560, low: 0.2 },
		{ duration: 480, low: 0.45 }
	];
	const barWidth = Math.max(2, Math.round(size / 5));

	return (
		<View
			style={{
				width: size,
				height: size,
				flexDirection: 'row',
				alignItems: 'flex-end',
				justifyContent: 'space-between'
			}}
			accessibilityElementsHidden
			importantForAccessibility='no-hide-descendants'
		>
			{bars.map((bar, index) =>
				playing && !reduced ? (
					<MotiView
						key={`on-${index}`}
						from={{ height: size * bar.low }}
						animate={{ height: size }}
						transition={{
							type: 'timing',
							duration: bar.duration,
							loop: true,
							easing: Easing.inOut(Easing.quad)
						}}
						style={{
							width: barWidth,
							borderRadius: barWidth / 2,
							backgroundColor: color
						}}
					/>
				) : (
					<View
						key={`off-${index}`}
						style={{
							width: barWidth,
							height: size * bar.low + 2,
							borderRadius: barWidth / 2,
							backgroundColor: color
						}}
					/>
				)
			)}
		</View>
	);
}

/**
 * Concentric rings that swell and fade — "something is alive here". Used behind
 * the welcome mark and anywhere a single element should draw the eye once.
 * Renders nothing when motion is reduced: the rings are decoration only.
 */
export function Pulse({
	color,
	size,
	rings = 2,
	active = true
}: {
	color: string;
	size: number;
	rings?: number;
	active?: boolean;
}): ReactElement | null {
	const reduced = useReducedMotionPreference();
	if (reduced || !active) return null;

	return (
		<View
			pointerEvents='none'
			style={{
				position: 'absolute',
				width: size,
				height: size,
				alignItems: 'center',
				justifyContent: 'center'
			}}
		>
			{Array.from({ length: rings }, (_, index) => (
				<MotiView
					key={index}
					from={{ opacity: 0.32, scale: 1 }}
					animate={{ opacity: 0, scale: 1.9 }}
					transition={{
						type: 'timing',
						duration: 2600,
						delay: index * 900,
						loop: true,
						repeatReverse: false,
						easing: Easing.out(Easing.quad)
					}}
					style={{
						position: 'absolute',
						width: size,
						height: size,
						borderRadius: size / 2,
						borderWidth: 1.5,
						borderColor: color
					}}
				/>
			))}
		</View>
	);
}

/**
 * Cross-fades whatever it wraps when `id` changes, the old content leaving
 * upward as the new rises in. This is what makes a track change feel like one
 * continuous surface instead of a text node being swapped.
 */
export function Swap({
	id,
	children,
	distance = 10,
	style
}: {
	id: string | number;
	children: ReactNode;
	distance?: number;
	style?: StyleProp<ViewStyle>;
}): ReactElement {
	const reduced = useReducedMotionPreference();
	if (reduced) return <View style={style}>{children}</View>;

	return (
		<AnimatePresence exitBeforeEnter>
			<MotiView
				key={id}
				from={{ opacity: 0, translateY: distance }}
				animate={{ opacity: 1, translateY: 0 }}
				exit={{ opacity: 0, translateY: -distance }}
				transition={{
					type: 'timing',
					duration: motion.duration.base,
					easing: Easing.out(Easing.cubic)
				}}
				style={style}
			>
				{children}
			</MotiView>
		</AnimatePresence>
	);
}
