/** Spotify share-link detection — the client's one domain rule for when a
 * search box has actually been handed a link instead of a query. Kept here
 * rather than in the page module because App Router pages may only export
 * their component. */

const SPOTIFY_LINK_RE =
  /(?:https?:\/\/)?(?:open\.spotify\.com|spotify\.link|spoti\.fi)\/\S+|^spotify:(track|album|playlist|artist):\S+/i;

export function looksLikeSpotifyLink(text: string): boolean {
  return SPOTIFY_LINK_RE.test(text.trim());
}
