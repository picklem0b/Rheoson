/**
 * Colours for browse tiles.
 *
 * The same seven accent hues the website offers as themes, so a "Chill" tile on
 * the phone is tinted from the same family as the web accent picker. The tint is
 * derived from the category's slug, which means a category keeps its colour
 * between launches and between devices without the server having to send one.
 */
export const CATEGORY_TINTS = [
	'#E5193A', // crimson
	'#F43F5E', // rose
	'#F97316', // orange
	'#8B5CF6', // violet
	'#06B6D4', // cyan
	'#22C55E', // green
	'#EAB308' // gold
] as const;

/** A stable colour for a category, chosen by hashing its slug. */
export function tintFor(slug: string): string {
	let hash = 0;
	for (let i = 0; i < slug.length; i += 1) {
		hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
	}
	return CATEGORY_TINTS[hash % CATEGORY_TINTS.length] ?? CATEGORY_TINTS[0];
}
