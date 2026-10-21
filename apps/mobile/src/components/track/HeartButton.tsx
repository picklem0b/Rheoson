import { useEffect, useRef, type ReactElement } from 'react';
import Animated, {
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming
} from 'react-native-reanimated';
import { HeartIcon } from 'phosphor-react-native';

import { IconButton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useLikeButton } from '@/hooks/use-liked';

/**
 * The favourite heart.
 *
 * Liking is the one tap in the app that is purely emotional, so it is the one
 * place motion is allowed to overshoot: the heart squeezes and springs past
 * full size on the way to filled. Un-liking only settles — nothing celebrates
 * a removal. The animation fires when the *state* changes, not when the button
 * is pressed, so it also plays when a like arrives from somewhere else (the
 * player's heart while a list is on screen).
 */
export function HeartButton({
	trackId,
	size = 20
}: {
	trackId: string;
	size?: number;
}): ReactElement {
	const { colour } = useTheme();
	const { isLiked, onPress } = useLikeButton(trackId);
	const reduced = useReducedMotion();

	const scale = useSharedValue(1);
	const first = useRef(true);

	useEffect(() => {
		if (first.current) {
			first.current = false;
			return;
		}
		if (reduced) return;
		if (isLiked) {
			scale.value = withSequence(
				withTiming(0.68, { duration: 90 }),
				withSpring(1, { damping: 7, stiffness: 260, mass: 0.7 })
			);
		} else {
			scale.value = withSequence(
				withTiming(0.88, { duration: 80 }),
				withSpring(1, { damping: 16, stiffness: 300 })
			);
		}
	}, [isLiked, reduced, scale]);

	const style = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }]
	}));

	return (
		<IconButton
			label={isLiked ? 'Remove from favourites' : 'Add to favourites'}
			onPress={onPress}
		>
			<Animated.View style={style}>
				<HeartIcon
					size={size}
					color={isLiked ? colour.accent : colour.textMuted}
					weight={isLiked ? 'fill' : 'regular'}
				/>
			</Animated.View>
		</IconButton>
	);
}
