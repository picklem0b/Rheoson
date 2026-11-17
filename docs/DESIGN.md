# Rheoson V3: Design

## Tokens, three layers

Ported from V2 and kept exactly as they were, because they were right:

```
primitive   raw values: hex, rgb channel triplets, motion curves, radii
   |
semantic    purpose names: --background, --muted-foreground, --color-brand
   |
component   bindings: --spacing-player, --spacing-nav, --spacing-sidebar
```

Components read **semantic** names only. A theme change is an edit to `:root`,
never a hunt through components. Accent colours are held as channel triplets
(`--accent-rgb`) so Tailwind's opacity modifier works: `bg-brand/20` compiles,
`bg-[var(--accent)]/20` does not.

Status colours (`--danger`, `--success`, `--warning`) are fixed across themes and
accents. Feedback must stay recognisable whatever colour the user picked.

## Type

Outfit, self-hosted through `@fontsource-variable/outfit`, no render-blocking
font request. One display size per
surface, not three. Numerals tabular wherever a duration or a count can change
in place, so the layout does not twitch during playback.

## Shells

Two shells, chosen once from pointer modality and width, never re-chosen mid
session:

- **Desktop**: 240 px sidebar, content column, 80 px player bar pinned.
- **Mobile**: content, 64 px bottom nav, player bar above it.

Both reserve the player height in layout so nothing hides behind it. Safe-area
insets are padding, not margin, so a notch never clips a control.

## Motion

Frequency-gated: the more often you do something, the less it animates.

| Frequency | Movement |
| --- | --- |
| Playback controls | none |
| Navigation | 200 ms, `--ease-ios` |
| Sheets and reveals | 320 ms, `--ease-ios` |
| Celebration (playful) | `--ease-spring`, rare |

Reduce-motion disables transitions wholesale. Keyboard-initiated changes never
animate at all, because an animation on a key press reads as lag.

## Components

From shadcn for the primitives a design system should not reinvent: button,
sheet, dialog, toast, skeleton, slider, avatar, scroll area. The CLI config
lands in `web/components.json`; the primitives arrive with M3.

Owned by us, because they carry product meaning:

- `ArtworkImage`: one placeholder, one aspect, one failure state.
- `TrackRow`: the only place a track is rendered as a row.
- `EmptyState`: an empty surface always says what it is and what to do next.
- `ErrorPage`: code, plain label, and the explanation behind a disclosure.
- `ErrorCodeChip`: shows `[ERROR_CODE: …]` and copies it to the clipboard.
- `NetworkBanner`: offline is a state, not a toast that disappears.

## States, all four of them

Every surface that fetches answers all four, and the fourth is the one usually
forgotten:

1. **Loading** — a skeleton shaped like the content, not a spinner in a void.
2. **Empty** — what this is, and the one action that fills it.
3. **Error** — the code, a sentence a person can read, and a retry.
4. **Degraded** — the provider is down, the rest of the app still works, and the
   surface says which part is missing.

## Non-negotiables

- No raw palette colours in components. Semantic tokens only.
- No text below 12 px. No tap target below 44 px.
- One focus ring, defined once, visible on every interactive element.
- Hover states never carry information a touch user cannot get: on touch, the
  row menu is always visible rather than revealed on hover.
- Copy is sentence case and says what happened. A failure names the thing that
  failed and the action that helps.
