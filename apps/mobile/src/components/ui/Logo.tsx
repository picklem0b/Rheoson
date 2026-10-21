import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';

/**
 * The Rheoson mark.
 *
 * Mirrors the website's `AppLogo`: every surface that means "Rheoson" draws this
 * rather than a generic music glyph, so the identity is the same on the web and
 * in the app.
 *
 * It is drawn into a *square* box with `contentFit='contain'`. The artwork is a
 * circle with the note's stem poking out of the top, so it is not square; a
 * `cover` fit — or an unsized image — crops the circle and reads as "zoomed
 * in". Containing it inside a fixed square is what keeps the whole mark visible
 * at every size.
 */
const SIZES = { xs: 24, sm: 32, md: 40, lg: 56, xl: 88, hero: 132 } as const;

export type LogoSize = keyof typeof SIZES;

export function Logo({ size = 'md' }: { size?: LogoSize }): ReactElement {
	const box = SIZES[size];
	return (
		<View
			style={{
				width: box,
				height: box,
				alignItems: 'center',
				justifyContent: 'center'
			}}
		>
			<Image
				source={require('../../../assets/logo-solid.png')}
				style={{ width: box, height: box }}
				contentFit='contain'
				accessibilityLabel='Rheoson'
			/>
		</View>
	);
}
