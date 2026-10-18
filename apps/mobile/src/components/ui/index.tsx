/**
 * The app's UI kit.
 *
 * Screens compose these and never reach for raw `View`/`Text` styling, which is
 * what keeps spacing, type and colour consistent across thirty screens. Every
 * component here reads the theme from `useTheme()` and accepts no colour props:
 * a screen that wants a different colour is a screen that should be using a
 * different component.
 */
import type { ReactElement, ReactNode } from 'react';
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text as RNText,
	View,
	type StyleProp,
	type TextStyle,
	type ViewStyle
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { layout, radius, spacing, TOUCH_TARGET, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextVariant = keyof typeof typography;

/** Text with the app's scale. `variant` is the only way to size text. */
export function Text({
	children,
	variant = 'body',
	muted = false,
	numberOfLines,
	style
}: {
	children: ReactNode;
	variant?: TextVariant;
	muted?: boolean;
	numberOfLines?: number;
	style?: StyleProp<TextStyle>;
}): ReactElement {
	const { colour } = useTheme();
	return (
		<RNText
			numberOfLines={numberOfLines}
			style={[
				typography[variant],
				{ color: muted ? colour.textMuted : colour.text },
				style
			]}
		>
			{children}
		</RNText>
	);
}

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
		<View style={[{ paddingHorizontal: spacing.lg, gap: spacing.md }, style]}>{children}</View>
	);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
			{scroll ? (
				<ScrollView
					contentContainerStyle={{
						paddingBottom: layout.miniPlayer + spacing.xxl,
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

/** The bar at the top of a screen: a title, and optionally a leading action. */
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
		<View
			style={{
				height: layout.header,
				flexDirection: 'row',
				alignItems: 'center',
				justifyContent: 'space-between'
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
	);
}

/** A row that does something. Every list of actions is built from this. */
export function ListRow({
	title,
	subtitle,
	leading,
	trailing,
	onPress,
	disabled = false
}: {
	title: string;
	subtitle?: string;
	leading?: ReactNode;
	trailing?: ReactNode;
	onPress?: () => void;
	disabled?: boolean;
}): ReactElement {
	const { colour } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled || !onPress}
			style={({ pressed }) => ({
				minHeight: TOUCH_TARGET + spacing.md,
				flexDirection: 'row',
				alignItems: 'center',
				gap: spacing.md,
				paddingVertical: spacing.sm,
				opacity: disabled ? 0.5 : 1,
				backgroundColor: pressed ? colour.surfacePressed : 'transparent',
				borderRadius: radius.md
			})}
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
		</Pressable>
	);
}

/** The primary action. One per screen is the rule of thumb. */
export function Button({
	label,
	onPress,
	variant = 'primary',
	disabled = false,
	loading = false
}: {
	label: string;
	onPress: () => void;
	variant?: 'primary' | 'secondary' | 'ghost';
	disabled?: boolean;
	loading?: boolean;
}): ReactElement {
	const { colour } = useTheme();
	const background =
		variant === 'primary'
			? colour.accent
			: variant === 'secondary'
				? colour.surfaceRaised
				: 'transparent';

	return (
		<Pressable
			onPress={onPress}
			disabled={disabled || loading}
			style={({ pressed }) => ({
				height: TOUCH_TARGET + spacing.sm,
				borderRadius: radius.pill,
				alignItems: 'center',
				justifyContent: 'center',
				paddingHorizontal: spacing.xl,
				backgroundColor: background,
				opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
				borderWidth: variant === 'ghost' ? StyleSheet.hairlineWidth : 0,
				borderColor: colour.border
			})}
		>
			{loading ? (
				<ActivityIndicator color={variant === 'primary' ? colour.onAccent : colour.text} />
			) : (
				<Text
					variant='label'
					style={{ color: variant === 'primary' ? colour.onAccent : colour.text }}
				>
					{label}
				</Text>
			)}
		</Pressable>
	);
}

/** An icon-only control. Always at least a finger wide. */
export function IconButton({
	children,
	onPress,
	label,
	active = false
}: {
	children: ReactNode;
	onPress: () => void;
	label: string;
	active?: boolean;
}): ReactElement {
	const { colour } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityLabel={label}
			accessibilityRole='button'
			hitSlop={spacing.sm}
			style={({ pressed }) => ({
				width: TOUCH_TARGET,
				height: TOUCH_TARGET,
				alignItems: 'center',
				justifyContent: 'center',
				borderRadius: radius.pill,
				opacity: pressed ? 0.6 : 1,
				backgroundColor: active ? colour.surfaceRaised : 'transparent'
			})}
		>
			{children}
		</Pressable>
	);
}

/** Square artwork, rounded. Covers the loading and missing cases itself. */
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

/** Section heading with an optional "see all". */
export function SectionHeader({
	title,
	onSeeAll
}: {
	title: string;
	onSeeAll?: () => void;
}): ReactElement {
	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				justifyContent: 'space-between',
				marginTop: spacing.sm
			}}
		>
			<Text variant='heading'>{title}</Text>
			{onSeeAll ? (
				<Pressable onPress={onSeeAll} hitSlop={spacing.sm}>
					<Text variant='label' muted>
						See all
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}

/** Nothing here yet — says what would fill it, not just that it is empty. */
export function EmptyState({
	title,
	message,
	action
}: {
	title: string;
	message: string;
	action?: ReactNode;
}): ReactElement {
	return (
		<View style={{ alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.sm }}>
			<Text variant='heading'>{title}</Text>
			<Text variant='caption' muted style={{ textAlign: 'center', maxWidth: 280 }}>
				{message}
			</Text>
			{action}
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
		<View
			style={{
				padding: spacing.lg,
				borderRadius: radius.lg,
				backgroundColor: colour.dangerBg,
				gap: spacing.sm
			}}
		>
			<Text variant='bodyStrong'>Something did not work</Text>
			<Text variant='caption' muted>
				{message}
			</Text>
			{onRetry ? <Button label='Try again' variant='secondary' onPress={onRetry} /> : null}
		</View>
	);
}

/** A placeholder for content that is on its way. */
export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }): ReactElement {
	const { colour } = useTheme();
	return (
		<View
			style={{
				height,
				width: width as number,
				borderRadius: radius.sm,
				backgroundColor: colour.skeleton
			}}
		/>
	);
}

/** A pill — filters, categories, states. */
export function Chip({ label, onPress, active = false }: { label: string; onPress?: () => void; active?: boolean }): ReactElement {
	const { colour } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			style={{
				paddingHorizontal: spacing.lg,
				height: 36,
				justifyContent: 'center',
				borderRadius: radius.pill,
				backgroundColor: active ? colour.accent : colour.surfaceRaised,
				borderWidth: StyleSheet.hairlineWidth,
				borderColor: colour.border
			}}
		>
			<Text variant='caption' style={{ color: active ? colour.onAccent : colour.text }}>
				{label}
			</Text>
		</Pressable>
	);
}
