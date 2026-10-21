/**
 * The app's UI kit.
 *
 * Screens compose these and never reach for raw `View`/`Text` styling, which is
 * what keeps spacing, type, colour and motion consistent across every screen.
 * Every component here reads the theme from `useTheme()` and accepts no colour
 * props: a screen that wants a different colour is a screen that should be
 * using a different component.
 *
 * Motion lives in the kit, not in screens. A press gives under the finger, a
 * section arrives with a soft rise, an empty state pops in — and because the
 * primitives own it, a new screen is animated the moment it is built from them.
 */
import type { ReactElement, ReactNode } from 'react';
import {
	ActivityIndicator,
	ScrollView,
	StyleSheet,
	View,
	type StyleProp,
	type ViewStyle
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
	CaretRightIcon,
	MusicNotesIcon,
	WarningCircleIcon
} from 'phosphor-react-native';
import { MotiView } from 'moti';

import {
	PressableScale,
	Pop,
	Reveal,
	Shimmer,
	useReducedMotionPreference
} from '@/components/motion';
import {
	layout,
	motion,
	radius,
	spacing,
	TOUCH_TARGET
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './Text';

/** A screen: safe area, background, and the shared horizontal gutter. */
export function Screen({
	children,
	scroll = false,
	style
}: {
	children: ReactNode;
	scroll?: boolean;
	style?: StyleProp<ViewStyle>;
}): ReactElement {
	const { colour } = useTheme();
	const body = (
		<View style={[{ paddingHorizontal: spacing.lg, gap: spacing.md }, style]}>
			{children}
		</View>
	);

	return (
		<SafeAreaView
			style={{ flex: 1, backgroundColor: colour.background }}
			edges={['top']}
		>
			{scroll ? (
				<ScrollView
					contentContainerStyle={{
						paddingBottom: layout.miniPlayer + layout.tabBar + spacing.xxl,
						gap: spacing.md
					}}
					showsVerticalScrollIndicator={false}
				>
					{body}
				</ScrollView>
			) : (
				body
			)}
		</SafeAreaView>
	);
}

/** The bar at the top of a screen: a title, and optionally a trailing action. */
export function AppBar({
	title,
	subtitle,
	action
}: {
	title: string;
	subtitle?: string;
	action?: ReactNode;
}): ReactElement {
	return (
		<Reveal distance={-8}>
			<View
				style={{
					minHeight: layout.header + spacing.sm,
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'space-between',
					paddingTop: spacing.xs
				}}
			>
				<View style={{ flex: 1 }}>
					<Text variant='title' numberOfLines={1}>
						{title}
					</Text>
					{subtitle ? (
						<Text variant='caption' muted numberOfLines={1}>
							{subtitle}
						</Text>
					) : null}
				</View>
				{action}
			</View>
		</Reveal>
	);
}

/** A row that does something. Every list of actions is built from this. */
export function ListRow({
	title,
	subtitle,
	leading,
	trailing,
	onPress,
	disabled = false,
	revealIndex
}: {
	title: string;
	subtitle?: string;
	leading?: ReactNode;
	trailing?: ReactNode;
	onPress?: () => void;
	disabled?: boolean;
	/** When set, the row rises in with a stagger of this position. */
	revealIndex?: number;
}): ReactElement {
	const row = (
		<PressableScale
			onPress={onPress}
			disabled={disabled || !onPress}
			to={0.985}
			accessibilityRole={onPress ? 'button' : undefined}
			accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
			style={{
				minHeight: TOUCH_TARGET + spacing.lg,
				flexDirection: 'row',
				alignItems: 'center',
				gap: spacing.md,
				paddingVertical: spacing.sm,
				opacity: disabled ? 0.5 : 1
			}}
		>
			{leading}
			<View style={{ flex: 1 }}>
				<Text variant='bodyStrong' numberOfLines={1}>
					{title}
				</Text>
				{subtitle ? (
					<Text variant='caption' muted numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
			{trailing}
		</PressableScale>
	);

	return revealIndex === undefined ? (
		row
	) : (
		<Reveal index={revealIndex} distance={10}>
			{row}
		</Reveal>
	);
}

/** A chevron for rows that open another page. */
export function RowChevron(): ReactElement {
	const { colour } = useTheme();
	return <CaretRightIcon size={18} color={colour.textMuted} />;
}

/**
 * The primary action. One per screen is the rule of thumb (Von Restorff: the
 * one accent-filled control is the one people find first).
 */
export function Button({
	label,
	onPress,
	variant = 'primary',
	disabled = false,
	loading = false,
	icon
}: {
	label: string;
	onPress: () => void;
	variant?: 'primary' | 'secondary' | 'ghost';
	disabled?: boolean;
	loading?: boolean;
	icon?: ReactNode;
}): ReactElement {
	const { colour } = useTheme();
	const background =
		variant === 'primary'
			? colour.accent
			: variant === 'secondary'
				? colour.surfaceRaised
				: 'transparent';
	const foreground = variant === 'primary' ? colour.onAccent : colour.text;

	return (
		<PressableScale
			onPress={onPress}
			disabled={disabled || loading}
			to={0.96}
			accessibilityRole='button'
			accessibilityLabel={label}
			accessibilityState={{ disabled: disabled || loading, busy: loading }}
			style={{
				height: TOUCH_TARGET + spacing.md,
				borderRadius: radius.pill,
				alignItems: 'center',
				justifyContent: 'center',
				flexDirection: 'row',
				gap: spacing.sm,
				paddingHorizontal: spacing.xl,
				backgroundColor: background,
				opacity: disabled ? 0.45 : 1,
				borderWidth: variant === 'primary' ? 0 : StyleSheet.hairlineWidth,
				borderColor: variant === 'ghost' ? colour.borderStrong : colour.border
			}}
		>
			{loading ? (
				<ActivityIndicator color={foreground} />
			) : (
				<>
					{icon}
					<Text variant='bodyStrong' style={{ color: foreground }}>
						{label}
					</Text>
				</>
			)}
		</PressableScale>
	);
}

/** An icon-only control. Always at least a finger wide. */
export function IconButton({
	children,
	onPress,
	label,
	active = false,
	size = TOUCH_TARGET
}: {
	children: ReactNode;
	onPress: () => void;
	label: string;
	active?: boolean;
	size?: number;
}): ReactElement {
	const { colour } = useTheme();
	return (
		<PressableScale
			onPress={onPress}
			accessibilityLabel={label}
			accessibilityRole='button'
			hitSlop={spacing.sm}
			to={0.86}
			style={{
				width: size,
				height: size,
				alignItems: 'center',
				justifyContent: 'center'
			}}
		>
			<MotiView
				animate={{
					backgroundColor: active ? colour.accentSubtle : 'rgba(0,0,0,0)'
				}}
				transition={{ type: 'timing', duration: motion.duration.base }}
				style={{
					width: size,
					height: size,
					borderRadius: size / 2,
					alignItems: 'center',
					justifyContent: 'center'
				}}
			>
				{children}
			</MotiView>
		</PressableScale>
	);
}

/** Section heading with an optional "see all". */
export function SectionHeader({
	title,
	onSeeAll,
	actionLabel = 'See all',
	index = 0
}: {
	title: string;
	onSeeAll?: () => void;
	actionLabel?: string;
	index?: number;
}): ReactElement {
	const { colour } = useTheme();
	return (
		<Reveal index={index} distance={10}>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'space-between',
					marginTop: spacing.md
				}}
			>
				<Text variant='heading'>{title}</Text>
				{onSeeAll ? (
					<PressableScale
						onPress={onSeeAll}
						hitSlop={spacing.md}
						to={0.94}
						accessibilityRole='button'
					>
						<Text variant='label' style={{ color: colour.accentBright }}>
							{actionLabel}
						</Text>
					</PressableScale>
				) : null}
			</View>
		</Reveal>
	);
}

/** Nothing here yet — says what would fill it, not just that it is empty. */
export function EmptyState({
	title,
	message,
	action,
	icon
}: {
	title: string;
	message: string;
	action?: ReactNode;
	icon?: ReactNode;
}): ReactElement {
	const { colour } = useTheme();
	return (
		<View
			style={{
				alignItems: 'center',
				paddingVertical: spacing.xxxl,
				gap: spacing.md
			}}
		>
			<Pop>
				<View
					style={{
						width: 72,
						height: 72,
						borderRadius: 36,
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: colour.accentSubtle,
						borderWidth: StyleSheet.hairlineWidth,
						borderColor: colour.accentBorder
					}}
				>
					{icon ?? (
						<MusicNotesIcon size={30} color={colour.accent} weight='fill' />
					)}
				</View>
			</Pop>
			<Reveal index={1} distance={8}>
				<View style={{ alignItems: 'center', gap: spacing.xs }}>
					<Text variant='heading'>{title}</Text>
					<Text
						variant='caption'
						muted
						style={{ textAlign: 'center', maxWidth: 290 }}
					>
						{message}
					</Text>
				</View>
			</Reveal>
			{action ? (
				<Reveal index={2} distance={8}>
					{action}
				</Reveal>
			) : null}
		</View>
	);
}

/** A failure the user can act on. The message is the API's own. */
export function ErrorState({
	message,
	onRetry
}: {
	message: string;
	onRetry?: () => void;
}): ReactElement {
	const { colour } = useTheme();
	return (
		<Reveal distance={8}>
			<View
				style={{
					padding: spacing.lg,
					borderRadius: radius.lg,
					backgroundColor: colour.dangerBg,
					gap: spacing.md
				}}
			>
				<View
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						gap: spacing.sm
					}}
				>
					<WarningCircleIcon size={22} color={colour.danger} weight='fill' />
					<Text variant='bodyStrong'>Something did not work</Text>
				</View>
				<Text variant='caption' muted>
					{message}
				</Text>
				{onRetry ? (
					<Button label='Try again' variant='secondary' onPress={onRetry} />
				) : null}
			</View>
		</Reveal>
	);
}

/** A placeholder for content that is on its way. It breathes. */
export function Skeleton({
	height = 16,
	width = '100%',
	rounded
}: {
	height?: number;
	width?: number | `${number}%` | string;
	rounded?: number;
}): ReactElement {
	return (
		<Shimmer
			height={height}
			width={width as number | `${number}%`}
			rounded={rounded ?? radius.md}
		/>
	);
}

/** A pill — filters, categories, states. The selected fill cross-fades. */
export function Chip({
	label,
	onPress,
	active = false
}: {
	label: string;
	onPress?: () => void;
	active?: boolean;
}): ReactElement {
	const { colour } = useTheme();
	const reduced = useReducedMotionPreference();
	return (
		<PressableScale
			onPress={onPress}
			to={0.94}
			accessibilityRole='button'
			accessibilityState={{ selected: active }}
			accessibilityLabel={label}
		>
			<MotiView
				animate={{
					backgroundColor: active ? colour.accent : colour.surfaceRaised,
					borderColor: active ? colour.accent : colour.border
				}}
				transition={
					reduced
						? { type: 'timing', duration: 0 }
						: { type: 'timing', duration: motion.duration.base }
				}
				style={{
					paddingHorizontal: spacing.lg,
					height: 38,
					justifyContent: 'center',
					borderRadius: radius.pill,
					borderWidth: StyleSheet.hairlineWidth
				}}
			>
				<Text
					variant='label'
					style={{ color: active ? colour.onAccent : colour.text }}
				>
					{label}
				</Text>
			</MotiView>
		</PressableScale>
	);
}

export { Text } from './Text';
export type { TextVariant } from './Text';
export { Sheet } from './Sheet';
export { Field } from './Field';
export { ToggleRow } from './ToggleRow';
export { ProgressBar } from './ProgressBar';
export { MediaCard } from './MediaCard';
export { Artwork } from './Artwork';
export { Toaster } from './Toaster';
export { Logo } from './Logo';
