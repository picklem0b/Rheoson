import type { ReactElement } from 'react';
import { useRef, useState } from 'react';
import { PanResponder, View, type AccessibilityActionEvent } from 'react-native';

import { Text } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/formatters';

const THUMB = 14;
const TRACK = 4;

/**
 * The scrubber.
 *
 * A PanResponder rather than a slider dependency: the interaction is one
 * horizontal drag, and the whole width should be grabbable, not a 4dp line. The
 * fill follows the finger while dragging and only tells the engine on release —
 * seeking on every move would fire dozens of native seeks and make the audio
 * stutter under the finger.
 *
 * While dragging, the time label shows where the finger is rather than where
 * playback is, because those are two different moments and the one under the
 * finger is the one being chosen.
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
	const [drag, setDrag] = useState<number | null>(null);

	const widthRef = useRef(0);
	const durationRef = useRef(duration);
	const dragRef = useRef<number | null>(null);
	const onSeekRef = useRef(onSeek);

	durationRef.current = duration;
	onSeekRef.current = onSeek;

	const setDragValue = (x: number): void => {
		const width = widthRef.current;
		const total = durationRef.current;
		if (width <= 0 || total <= 0) return;
		const value = Math.max(0, Math.min(total, (x / width) * total));
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

	const value = drag ?? position;
	const ratio = duration > 0 ? Math.min(1, Math.max(0, value / duration)) : 0;

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
				}}
				accessibilityRole='adjustable'
				accessibilityLabel='Playback position'
				accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(value) }}
				accessibilityActions={[
					{ name: 'increment', label: 'Forward 15 seconds' },
					{ name: 'decrement', label: 'Back 15 seconds' }
				]}
				onAccessibilityAction={onAccessibilityAction}
				style={{ height: 36, justifyContent: 'center' }}
			>
				<View
					style={{
						height: TRACK,
						borderRadius: TRACK / 2,
						backgroundColor: colour.surfaceRaised,
						overflow: 'hidden'
					}}
				>
					<View style={{ width: `${ratio * 100}%`, height: TRACK, backgroundColor: colour.accent }} />
				</View>
				<View
					style={{
						position: 'absolute',
						left: `${ratio * 100}%`,
						marginLeft: -THUMB / 2,
						width: THUMB,
						height: THUMB,
						borderRadius: THUMB / 2,
						backgroundColor: colour.text,
						// The thumb sits on the line, not above it.
						top: (36 - THUMB) / 2
					}}
				/>
			</View>
			<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
				<Text variant='caption' muted>
					{formatDuration(value)}
				</Text>
				<Text variant='caption' muted>
					{duration > 0 ? formatDuration(duration) : '--:--'}
				</Text>
			</View>
		</View>
	);
}
