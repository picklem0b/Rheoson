#!/usr/bin/env bash
#
# Regenerate every Android brand asset from web/public/assets/logo.png.
#
# Why this is a script and not hand-edited PNGs: the launcher icons shipped
# from Capacitor's template are the stock Android Studio artwork (a teal tile
# with grid lines), so the app showed someone else's icon on the device home
# screen, in the app switcher and in notifications. Rebuilding them from the
# real logo is one command, and re-running it after a logo change keeps every
# density in sync instead of five binaries drifting apart.
#
#   ./scripts/generate-android-icons.sh          # from web/
#
# Requires ImageMagick 7 (`magick`). Outputs, all tracked in git:
#   android/app/src/main/res/mipmap-*/ic_launcher.png            legacy icon
#   android/app/src/main/res/mipmap-*/ic_launcher_round.png      round variant
#   android/app/src/main/res/mipmap-*/ic_launcher_foreground.png adaptive foreground
#   android/app/src/main/res/drawable*/splash.png                native splash
#   android/app/src/main/res/drawable*/ic_stat_rheoson.png       notification icon
set -euo pipefail

cd "$(dirname "$0")/.."

LOGO="public/assets/logo.png"
RES="android/app/src/main/res"
ICON_BG="#0A0A0A"

command -v magick >/dev/null 2>&1 || {
   echo "error: ImageMagick 7 (magick) is required" >&2
   exit 1
}
[ -f "$LOGO" ] || {
   echo "error: $LOGO not found" >&2
   exit 1
}

# Trim uniform borders once; the source logo has a little padding that would
# otherwise shrink the mark relative to the tile.
magick "$LOGO" -trim +repage /tmp/rheoson-logo-trim.png

# ── Legacy + round launcher icons ─────────────────────────────
# Sizes are the Android density buckets at the standard 48dp base.
declare -A ICON=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )

for density in "${!ICON[@]}"; do
   size="${ICON[$density]}"
   dir="$RES/mipmap-$density"
   mkdir -p "$dir"

   # The mark covers most of the tile: at 48dp the launcher crops very little
   # on older Android, and the dark plate matches the app's background so the
   # icon reads as one piece rather than a logo floating in a box.
   inner=$((size * 84 / 100))

   magick /tmp/rheoson-logo-trim.png -resize "${inner}x${inner}" \
      -background "$ICON_BG" -gravity center -extent "${size}x${size}" \
      -alpha remove -alpha off "$dir/ic_launcher.png"

   # Round variant: same art, clipped to a circle. Legacy round icons are
   # cropped, not scaled down, so the mark keeps its size.
   magick /tmp/rheoson-logo-trim.png -resize "${inner}x${inner}" \
      -background "$ICON_BG" -gravity center -extent "${size}x${size}" \
      -alpha remove -alpha off \
      \( -size "${size}x${size}" xc:none -fill white \
      -draw "circle $((size / 2)),$((size / 2)) $((size / 2)),0" \) \
      -alpha set -compose DstIn -composite "$dir/ic_launcher_round.png"

   # Adaptive foreground: 108dp canvas, and only the inner ~66dp is guaranteed
   # visible — anything outside can be masked away by the launcher, so the mark
   # is kept inside the safe zone with a transparent surround.
   fg=$((size * 108 / 48))
   mark=$((fg * 56 / 100))
   magick /tmp/rheoson-logo-trim.png -resize "${mark}x${mark}" \
      -background none -gravity center -extent "${fg}x${fg}" \
      -alpha on "$dir/ic_launcher_foreground.png"
done

# ── Notification icon ────────────────────────────────────────
# The download foreground service keeps the process alive while files are
# transferring, and its persistent notification is the OS's price for that.
# The plugin config named an icon that does not exist in the project, so the
# notification had nothing to draw. Android wants a white-on-transparent
# silhouette here (a colour icon is rendered as a grey blob), which the logo's
# own alpha channel gives us directly.
#
# If this name changes, change `LocalNotifications.smallIcon` in
# capacitor.config.ts to match.
declare -A NOTIF=( [drawable]=24 [drawable-mdpi]=24 [drawable-hdpi]=36 \
                  [drawable-xhdpi]=48 [drawable-xxhdpi]=72 [drawable-xxxhdpi]=96 )

for dir_name in "${!NOTIF[@]}"; do
   n="${NOTIF[$dir_name]}"
   mkdir -p "$RES/$dir_name"
   magick /tmp/rheoson-logo-trim.png -resize "${n}x${n}" \
      -background none -gravity center -extent "${n}x${n}" \
      -alpha extract /tmp/rheoson-mask.png
   magick -size "${n}x${n}" xc:white /tmp/rheoson-mask.png \
      -alpha off -compose CopyOpacity -composite "$RES/$dir_name/ic_stat_rheoson.png"
done
rm -f /tmp/rheoson-mask.png

# ── Native splash ─────────────────────────────────────────────
# The dark plate is what Capacitor fades from before the JS splash takes over,
# so both are the same brand black with the mark centred.
for splash in "$RES"/drawable/splash.png "$RES"/drawable-*/splash.png; do
   [ -f "$splash" ] || continue
   read -r w h <<<"$(magick identify -format '%w %h' "$splash")"
   # Portrait/landscape screens are 3–4× wider or taller than tall; scale the
   # mark off the shorter edge so it looks the same size in both orientations.
   edge=$((w < h ? w : h))
   mark=$((edge * 34 / 100))
   magick /tmp/rheoson-logo-trim.png -resize "${mark}x${mark}" \
      -background "$ICON_BG" -gravity center -extent "${w}x${h}" \
      -alpha remove -alpha off "$splash"
done

rm -f /tmp/rheoson-logo-trim.png

echo "Android brand assets regenerated from $LOGO"
