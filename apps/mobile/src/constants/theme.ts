/**
 * Rheoson design tokens, ported from the website's semantic layer.
 *
 * The website defines primitives → semantic → component layers in CSS; React
 * Native has no cascade, so the semantic layer is what lives here and screens
 * read only these names. Re-theming stays a change to this file.
 *
 * A phone is not a narrow browser window, so the values differ from the web
 * build in two deliberate ways:
 *
 *  * Spacing and type are sized for a finger, not a cursor. The smallest
 *    interactive row is 56dp tall and nothing tappable is under 44dp.
 *  * Radii are larger and surfaces are flatter — no drop shadows on a dark
 *    phone screen, where they read as smudges; elevation is a lighter surface.
 */

/** Raw palette — never referenced by a component directly. */
const palette = {
	accent: '#E4253B',
	accentSoft: '#EB3E52',
	accentDeep: '#A51D2D',

	gray0: '#FFFFFF',
	gray25: '#FAFAFB',
	gray50: '#F5F5F6',
	gray100: '#ECECEE',
	gray200: '#D9D9DC',
	gray300: '#BEBEC3',
	gray400: '#98989E',
	gray500: '#74747A',
	gray600: '#58585E',
	gray700: '#3C3C41',
	gray800: '#26262A',
	gray850: '#1A1A1E',
	gray900: '#111113',
	gray925: '#0C0C0E',
	gray950: '#080809',

	red: '#F04438',
	redSoft: '#FDA29B',
	green: '#12B76A',
	greenSoft: '#6CE9A6',
	amber: '#F79009',
	amberSoft: '#FEC84B'
} as const;

/** One screen's worth of colours. Screens read these, never `palette`. */
export interface ThemeColors {
	accent: string
	accentPressed: string
	background: string
	surface: string
	surfaceRaised: string
	surfacePressed: string
	border: string
	borderStrong: string
	text: string
	textMuted: string
	textFaint: string
	onAccent: string
	danger: string
	dangerBg: string
	success: string
	successBg: string
	warning: string
	warningBg: string
	overlay: string
	skeleton: string
	player: string
}

const dark: ThemeColors = {
	accent: palette.accent,
	accentPressed: palette.accentDeep,
	background: palette.gray950,
	surface: palette.gray925,
	surfaceRaised: palette.gray850,
	surfacePressed: palette.gray800,
	border: 'rgba(255,255,255,0.08)',
	borderStrong: 'rgba(255,255,255,0.16)',
	text: palette.gray25,
	textMuted: palette.gray400,
	textFaint: palette.gray500,
	onAccent: palette.gray0,
	danger: palette.red,
	dangerBg: 'rgba(240,68,56,0.14)',
	success: palette.green,
	successBg: 'rgba(18,183,106,0.14)',
	warning: palette.amber,
	warningBg: 'rgba(247,144,9,0.14)',
	overlay: 'rgba(0,0,0,0.6)',
	skeleton: palette.gray850,
	player: '#141416'
}

const light: ThemeColors = {
	accent: palette.accent,
	accentPressed: palette.accentDeep,
	background: palette.gray25,
	surface: palette.gray0,
	surfaceRaised: palette.gray50,
	surfacePressed: palette.gray100,
	border: 'rgba(9,9,11,0.08)',
	borderStrong: 'rgba(9,9,11,0.16)',
	text: palette.gray900,
	textMuted: palette.gray500,
	textFaint: palette.gray400,
	onAccent: palette.gray0,
	danger: '#B42318',
	dangerBg: 'rgba(180,35,24,0.10)',
	success: '#027A48',
	successBg: 'rgba(2,122,72,0.10)',
	warning: '#B54708',
	warningBg: 'rgba(181,71,8,0.10)',
	overlay: 'rgba(9,9,11,0.4)',
	skeleton: palette.gray100,
	player: palette.gray0
}

/** 4pt grid. Named by intent where a screen would otherwise guess. */
export const spacing = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 20,
	xxl: 28,
	xxxl: 36
} as const

export const radius = {
	sm: 8,
	md: 12,
	lg: 16,
	xl: 22,
	pill: 999
} as const

/**
 * Type scale. `fontSize`/`lineHeight` are paired so no screen has to invent a
 * line height, and weights are limited to three so hierarchy stays legible.
 */
export const typography = {
	display: { fontSize: 34, lineHeight: 40, fontWeight: '700' as const },
	title: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const },
	heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const },
	body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
	bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
	label: { fontSize: 14, lineHeight: 18, fontWeight: '600' as const },
	caption: { fontSize: 13, lineHeight: 17, fontWeight: '400' as const },
	micro: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const }
} as const

/** Every tappable element is at least this tall — the platform minimum. */
export const TOUCH_TARGET = 44

/** Fixed heights that layout maths depends on. */
export const layout = {
	row: 64,
	header: 56,
	miniPlayer: 64,
	tabBar: 58
} as const

export const themes = { dark, light } as const
export type ThemeName = keyof typeof themes
