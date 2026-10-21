import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
	PanResponder,
	View,
	type AccessibilityActionEvent
} from 'react-native';
import Animated, {
	Easing,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSpring,
	withTiming
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { motion, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/formatters';

const THUMB = 14;
const TRACK = 4;
const TRACK_GROWN = 9;
const HIT = 40;

/**
 * The scrubber.
 *
 * A PanResponder rather than a slider dependency: the interaction is one
 * horizontal drag, and the whole width should be grabbable, not a 4dp line. The
 * fill follows the finger while dragging and only tells the engine on release —
 * seeking on every move would fire dozens of native seeks and make the audio
 * stutter under the finger.
 *
 * Two details copied from the players people already use: the bar thickens and
 * the thumb swells while a finger is on it (so you can see what you are
 * holding), and the time label shows where the finger is rather than where
 * playback is — those are two different moments, and the one under the finger
 * is the one being chosen.
 *
 * Outside a drag the fill glides between the player's half-second position
 * updates with a linear timing of the same length, so position reads as
 * continuous motion instead of ticking.
 */
export function SeekBar({
	position,
	duration,
	onSeek
}: {
	position: number;
	duration: number;
	onSeek: (seconds: number) => void;
}): ReactElement {
	const { colour } = useTheme();
	const reduced = useReducedMotion();
	const [drag, setDrag] = useState<number | null>(null);

	const widthRef = useRef(0);
	const durationRef = useRef(duration);
	const dragRef = useRef<number | null>(null);
	const onSeekRef = useRef(onSeek);

	durationRef.current = duration;
	onSeekRef.current = onSeek;

	const width = useSharedValue(0);
	const ratioValue = useSharedValue(0);
	const grow = useSharedValue(0);

	const setDragValue = (x: number): void => {
		const trackWidth = widthRef.current;
		const total = durationRef.current;
		if (trackWidth <= 0 || total <= 0) return;
		const value = Math.max(0, Math.min(total, (x / trackWidth) * total));
		dragRef.current = value;
		setDrag(value);
	};

	const commit = (): void => {
		const value = dragRef.current;
		dragRef.current = null;
		setDrag(null);
		if (value != null) onSeekRef.current(value);
	};

	const responder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderGrant: event => setDragValue(event.nativeEvent.locationX),
			onPanResponderMove: event => setDragValue(event.nativeEvent.locationX),
			onPanResponderRelease: () => commit(),
			onPanResponderTerminate: () => commit(),
			onPanResponderTerminationRequest: () => false
		})
	).current;

	const dragging = drag !== null;
	const value = drag ?? position;
	const ratio = duration > 0 ? Math.min(1, Math.max(0, value / duration)) : 0;

	useEffect(() => {
		if (dragging || reduced) {
			ratioValue.value = ratio;
		} else {
			ratioValue.value = withTiming(ratio, {
				duration: 500,
				easing: Easing.linear
			});
		}
	}, [ratio, dragging, reduced, ratioValue]);

	useEffect(() => {
		grow.value = reduced
			? dragging
				? 1
				: 0
			: withSpring(dragging ? 1 : 0, motion.press);
	}, [dragging, reduced, grow]);

	const trackStyle = useAnimatedStyle(() => {
		const height = TRACK + (TRACK_GROWN - TRACK) * grow.value;
		return { height, borderRadius: height / 2 };
	});
	const fillStyle = useAnimatedStyle(() => ({
		width: `${ratioValue.value * 100}%`
	}));
	const thumbStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: ratioValue.value * width.value - THUMB / 2 },
			{ scale: 1 + 0.45 * grow.value }
		]
	}));

	const onAccessibilityAction = (event: AccessibilityActionEvent): void => {
		const step = event.nativeEvent.actionName === 'increment' ? 15 : -15;
		onSeek(Math.max(0, Math.min(duration, position + step)));
	};

	return (
		<View style={{ gap: spacing.xs }}>
			<View
				{...responder.panHandlers}
				onLayout={event => {
					widthRef.current = event.nativeEvent.layout.width;
					width.value = event.nativeEvent.layout.width;
				}}
				accessibilityRole='adjustable'
				accessibilityLabel='Playback position'
				accessibilityValue={{
					min: 0,
					max: Math.round(duration),
					now: Math.round(value)
				}}
				accessibilityActions={[
					{ name: 'increment', label: 'Forward 15 seconds' },
					{ name: 'decrement', label: 'Back 15 seconds' }
				]}
				onAccessibilityAction={onAccessibilityAction}
				style={{ height: HIT, justifyContent: 'center' }}
			>
				{/* Children are inert so the touch target — and `locationX` — is always
				    this row, never the fill or thumb inside it. */}
				<Animated.View
					pointerEvents='none'
					style={[
						{ backgroundColor: colour.borderStrong, overflow: 'hidden' },
						trackStyle
					]}
				>
					<Animated.View
						style={[
							{ height: '100%', backgroundColor: colour.text },
							fillStyle
						]}
					/>
				</Animated.View>
				<Animated.View
					pointerEvents='none'
					style={[
						{
							position: 'absolute',
							left: 0,
							top: (HIT - THUMB) / 2,
							width: THUMB,
							height: THUMB,
							borderRadius: THUMB / 2,
							backgroundColor: colour.text
						},
						thumbStyle
					]}
				/>
			</View>
			<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
				<Text
					variant='caption'
					style={dragging ? undefined : { opacity: 0.75 }}
				>
					{formatDuration(value)}
				</Text>
				<Text variant='caption' muted>
					{duration > 0 ? formatDuration(duration) : '--:--'}
				</Text>
			</View>
		</View>
	);
}
