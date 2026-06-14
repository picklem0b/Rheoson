================================================================================
                              S H U L K E R
                        Music. Downloaded. Played.
================================================================================
Built by LethaboK — github.com/lethabokhedama-png/shulker
Version: 1.2.5 (as of May 2026)
================================================================================


────────────────────────────────────────────────────────────────────────────────
  WHAT IS SHULKER?
────────────────────────────────────────────────────────────────────────────────

Shulker is a self-hosted, open-source music application built for people who
want full control over their music. It looks and feels like Spotify Premium —
same layout, same smooth animations, same iOS-quality UI — but everything runs
on YOUR device or YOUR server. No subscription. No ads. No data collection.

The core idea: search any song, stream it instantly, download it in any format,
save it to playlists, see synced lyrics — all from one app that you own.

Shulker is not a Spotify wrapper. It does not touch Spotify's audio. It uses
YouTube Music as its audio source, and optionally uses Spotify's metadata API
(which is free) only to read song information like titles, artwork, and
track durations when you paste a Spotify link.


────────────────────────────────────────────────────────────────────────────────
  HOW IT WORKS — THE FULL FLOW
────────────────────────────────────────────────────────────────────────────────

1. USER SEARCHES OR PASTES A LINK
   ─────────────────────────────────
   The frontend sends the query to the FastAPI backend.

   • Plain text (e.g. "Kendrick Lamar Not Like Us"):
     → Backend calls ytmusicapi (YouTube Music's unofficial API)
     → Returns tracks, albums, artists, playlists with real artwork and metadata
     → Frontend shows results instantly

   • Spotify track URL:
     → Backend calls Spotify Web API with your credentials (metadata only)
     → Gets the song title and artist name
     → Searches YouTube Music for the best matching audio
     → Merges Spotify's high-quality artwork with YouTube's audio stream
     → You get Spotify's metadata quality + YouTube's audio

   • Spotify album/playlist URL:
     → Backend resolves every track in the album or playlist via Spotify API
     → Finds each track on YouTube Music
     → Returns the full collection ready to play or download

   • YouTube URL:
     → Backend extracts the video ID
     → Fetches track info via ytmusicapi
     → Returns immediately

   • Any other URL (SoundCloud, Bandcamp, Deezer, Apple Music, etc.):
     → Backend passes the URL directly to yt-dlp's info extractor
     → yt-dlp resolves the track or playlist
     → Returns whatever metadata and streams it can find

2. STREAMING (PLAYING A SONG)
   ──────────────────────────────
   When you tap a song:

   • Frontend calls /api/stream/{youtube_video_id}/audio
   • Backend checks if the track is already downloaded locally first
     → If yes: serves it directly from disk with HTTP range support (fast)
     → If no: extracts the direct YouTube CDN audio URL via yt-dlp
   • The direct URL is piped through ffmpeg, which re-encodes everything
     to plain MP3 (192kbps) on the fly
   • This normalises any format YouTube returns (webm, opus, m4a) into
     something every browser can play without issues
   • The frontend uses Howler.js with html5=true to stream in real time
     The song starts playing within seconds, not after a full download

   Why ffmpeg? YouTube sometimes returns webm/opus containers that browsers
   can't decode directly. ffmpeg converts on the fly so playback is reliable.

3. DOWNLOADING
   ────────────────
   When you tap "Save" or "Download" on a track:

   • Frontend sends trackId + format + quality to /api/downloads
   • Backend queues the job and returns immediately (you see it in Downloads)
   • In the background:
     → yt-dlp downloads the best audio quality available
     → ffmpeg converts it to your chosen format (mp3/flac/opus/m4a/wav)
     → mutagen writes ID3 tags: title, artist, album, artwork, lyrics
     → The file is saved to DOWNLOADS_DIR on the server
   • Real-time progress (0% → 100%) is pushed to the frontend via WebSocket
   • When done, rhea.mp3 plays as a notification sound
   • The file appears in Downloads → Saved tab

4. LOCAL LIBRARY
   ────────────────
   Shulker scans your local music directories on startup:
   • /data/data/com.termux/files/home/shulker/music (primary)
   • /storage/emulated/0/Music (Android music folder)
   • /storage/emulated/0/Download
   • Any additional directories you add in Settings → Storage

   Every audio file found is indexed by reading its ID3/vorbis tags.
   Local tracks appear in Library and can be played offline instantly.
   The Library page shows playlists, albums, and artists derived from
   your local files plus your created playlists.

5. LYRICS
   ─────────
   When you open Now Playing and tap the lyrics button:
   • Backend calls syncedlyrics library with the track title and artist
   • syncedlyrics tries to find timestamped LRC-format lyrics
   • If found: lyrics scroll in sync with playback (line by line)
   • If not found: falls back to plain lyrics (no timestamps)
   • Lyrics can be embedded into downloaded files as ID3 tags


────────────────────────────────────────────────────────────────────────────────
  ARCHITECTURE
────────────────────────────────────────────────────────────────────────────────

Shulker is split into two separate services:

  ┌─────────────────────────────────────────────────────────┐
  │                    FRONTEND (web/)                      │
  │                                                         │
  │  React 18 + TypeScript + Vite                          │
  │  Runs on port 3000 in dev, built to static files       │
  │  Deployed on Render as a static web service             │
  │                                                         │
  │  State:    Zustand (player, queue, downloads, UI, theme)│
  │  Data:     TanStack Query (caching, background refetch) │
  │  Audio:    Howler.js (html5 streaming mode)             │
  │  Animations: Framer Motion                             │
  │  Styling:  Tailwind CSS v3 + CSS custom properties     │
  │  Icons:    Lucide React                                 │
  │  Router:   React Router v6                             │
  └─────────────────────────────────────────────────────────┘
                           │  HTTP + WebSocket
                           ▼
  ┌─────────────────────────────────────────────────────────┐
  │                    BACKEND (api/)                       │
  │                                                         │
  │  FastAPI + Python 3.13 + uvicorn                       │
  │  Runs on port 8000                                     │
  │  Deployed on Render as a Python web service             │
  │                                                         │
  │  Real-time: Socket.IO (download progress over WS)      │
  │  Audio dl:  yt-dlp (download + stream extraction)      │
  │  Conversion:ffmpeg (format normalisation)              │
  │  Search:    ytmusicapi (YouTube Music)                  │
  │  Metadata:  Spotify Web API (optional, for links)      │
  │  Tags:      mutagen (ID3/vorbis/m4a tag writing)       │
  │  Lyrics:    syncedlyrics                               │
  │  Logging:   structlog                                   │
  │  Validation:Pydantic v2                                │
  └─────────────────────────────────────────────────────────┘


────────────────────────────────────────────────────────────────────────────────
  FILE STRUCTURE
────────────────────────────────────────────────────────────────────────────────

shulker/
├── README.md                   Project overview and quick start
├── CHANGELOG.md                Version history
├── render.yaml                 Render deployment config (both services)
├── .gitignore
│
├── docs/
│   ├── PRIVACY.md              Full privacy policy
│   ├── TERMS.md                Terms of service
│   ├── SECURITY.md             Security policy and vulnerability reporting
│   └── CONTRIBUTING.md         How to contribute
│
├── api/                        ← FastAPI backend
│   ├── pyproject.toml          Dependencies and project metadata
│   ├── .env                    Your local environment variables (not in git)
│   ├── .env.example            Template for environment setup
│   └── app/
│       ├── main.py             FastAPI app, Socket.IO mount, middleware
│       ├── cli.py              Terminal CLI (shulker command)
│       ├── core/
│       │   ├── config.py       Settings from environment variables
│       │   ├── exceptions.py   Custom exception types
│       │   └── logging.py      structlog configuration
│       ├── routers/
│       │   ├── search.py       GET /api/search, GET /api/search/suggest
│       │   ├── tracks.py       GET/POST /api/tracks (liked, history, play)
│       │   ├── stream.py       GET /api/stream/{id}/audio (the audio pipe)
│       │   ├── downloads.py    POST/GET /api/downloads
│       │   ├── lyrics.py       GET /api/lyrics/{id}
│       │   ├── playlists.py    CRUD /api/playlists
│       │   └── settings.py     POST /api/settings/spotify (save creds)
│       ├── schemas/
│       │   ├── track.py        TrackSchema, ArtistSchema, AlbumSchema
│       │   ├── search.py       SearchResultsSchema, ResolveResponseSchema
│       │   ├── download.py     DownloadJobSchema, DownloadRequestSchema
│       │   ├── playlist.py     PlaylistSchema
│       │   └── lyrics.py       LyricsSchema, LyricsLineSchema
│       ├── services/
│       │   ├── search_service.py     Smart routing: text/URL/Spotify/YouTube
│       │   ├── ytmusic_service.py    YouTube Music search + track fetch
│       │   ├── spotify_service.py    Spotify metadata API client
│       │   ├── download_service.py   yt-dlp download pipeline
│       │   ├── stream_service.py     ffmpeg pipe for live streaming
│       │   ├── metadata_service.py   Read/write ID3 tags with mutagen
│       │   ├── artwork_service.py    Extract/fetch album artwork
│       │   └── lyrics_service.py     Fetch and parse LRC lyrics
│       └── websocket/
│           ├── manager.py      Socket.IO wrapper singleton
│           └── events.py       connect/disconnect handlers
│
└── web/                        ← React frontend
    ├── index.html              Entry HTML (favicon, fonts, meta tags)
    ├── vite.config.ts          Vite config + dev proxy to API
    ├── tailwind.config.ts      Design tokens, colours, animations
    ├── tsconfig.json           TypeScript config
    ├── package.json            Dependencies
    │
    ├── public/
    │   └── assets/
    │       ├── logo.png        App logo (1254x1254 PNG)
    │       ├── favicon.ico     Browser favicon (PNG renamed)
    │       ├── anim-logo.mp4   Animated logo (5 seconds, plays on splash)
    │       └── rhea.mp3        Notification sound on download complete
    │
    └── src/
        ├── main.tsx            React root, QueryClientProvider
        ├── App.tsx             Theme init, audio unlock, splash screen
        ├── router.tsx          All routes defined here
        ├── index.css           CSS variables, themes, base styles
        │
        ├── types/              TypeScript interfaces
        │   ├── track.ts        Track, Artist, Album
        │   ├── player.ts       PlayerState, RepeatMode
        │   ├── download.ts     DownloadJob, AudioFormat, AudioQuality
        │   ├── playlist.ts     Playlist
        │   └── search.ts       SearchResults, SearchFilter
        │
        ├── store/              Zustand global state
        │   ├── playerStore.ts  Current track, playing, volume, progress
        │   ├── queueStore.ts   Queue, history, shuffle
        │   ├── downloadStore.ts Jobs list (persisted to localStorage)
        │   ├── uiStore.ts      Panels open/close, modal state
        │   └── themeStore.ts   Accent colour, surface (persisted)
        │
        ├── api/                API client functions
        │   ├── client.ts       Base fetch wrapper with error handling
        │   ├── search.ts       search(), getSuggestions(), resolve()
        │   ├── tracks.ts       getTrack(), likeTrack(), getStreamUrl()
        │   ├── downloads.ts    startDownload(), cancelDownload()
        │   ├── playlists.ts    CRUD for playlists
        │   └── lyrics.ts       getLyrics()
        │
        ├── hooks/              React hooks (logic lives here)
        │   ├── usePlayer.ts    Howler audio engine, play/pause/seek
        │   ├── useQueue.ts     Queue manipulation, playTrack()
        │   ├── useSearch.ts    Debounced search + instant suggestions
        │   ├── useDownloads.ts WebSocket progress, rhea.mp3 notification
        │   ├── useLyrics.ts    Fetch + sync lyrics to playback progress
        │   ├── useMediaSession.ts  OS media controls (lock screen)
        │   ├── useKeyboardShortcuts.ts  Space/arrows/N/P/R/S/Q/L
        │   └── useAudioAnalyser.ts  Frequency data for visualizer
        │
        ├── lib/                Utilities
        │   ├── utils.ts        cn(), clamp(), shuffle(), URL parsers
        │   ├── formatters.ts   formatDuration(), formatFileSize()
        │   ├── constants.ts    API_BASE, WS_URL, ENDPOINTS, APP_VERSION
        │   └── websocket.ts    Socket.IO client singleton
        │
        ├── pages/              One folder per page
        │   ├── home/Home.tsx           Real trending, recently played
        │   ├── search/Search.tsx       Search + suggestions dropdown
        │   ├── library/Library.tsx     Playlists, albums, artists tabs
        │   ├── liked/LikedSongs.tsx    Liked tracks from API
        │   ├── downloads/Downloads.tsx Tabbed: active/queued/saved/errors
        │   ├── nowplaying/NowPlaying.tsx Fullscreen player + lyrics
        │   ├── playlist/Playlist.tsx   Playlist detail
        │   ├── album/Album.tsx         Album detail
        │   ├── artist/Artist.tsx       Artist top tracks + albums
        │   └── settings/Settings.tsx  9 sections, all functional
        │
        ├── components/
        │   ├── ui/             Primitive components
        │   │   ├── Button.tsx, IconButton.tsx, Slider.tsx
        │   │   ├── Modal.tsx, Toast.tsx, Toaster.tsx
        │   │   ├── Badge.tsx, Skeleton.tsx, Spinner.tsx
        │   │   ├── ScrollArea.tsx, Tooltip.tsx
        │   │   └── SplashScreen.tsx  (uses anim-logo.mp4)
        │   ├── layout/
        │   │   ├── RootLayout.tsx   Shell: sidebar + main + playerbar
        │   │   ├── Sidebar.tsx      Desktop nav with real logo.png
        │   │   ├── BottomNav.tsx    Mobile pill nav
        │   │   └── TopBar.tsx       Back/forward + animated logo on hover
        │   ├── player/
        │   │   ├── PlayerBar.tsx    Persistent bar: artwork, controls, like, menu
        │   │   ├── PlayerControls.tsx prev/play/next/shuffle/repeat
        │   │   ├── ProgressBar.tsx  Seek slider + timestamps
        │   │   ├── VolumeControl.tsx Volume slider + mute
        │   │   ├── QueuePanel.tsx   Slide-in queue panel
        │   │   └── QueueItem.tsx    Single queue row with drag handle
        │   ├── search/
        │   │   ├── SearchBar.tsx
        │   │   ├── SearchResults.tsx
        │   │   └── CategoryGrid.tsx
        │   ├── library/
        │   │   ├── TrackRow.tsx, TrackList.tsx
        │   │   ├── AlbumCard.tsx, ArtistCard.tsx, PlaylistCard.tsx
        │   ├── download/
        │   │   ├── DownloadButton.tsx, DownloadItem.tsx, DownloadModal.tsx
        │   ├── lyrics/
        │   │   ├── LyricsPanel.tsx, LyricsLine.tsx
        │   └── visualizer/
        │       ├── BarVisualizer.tsx, WaveVisualizer.tsx
        │
        └── themes/
            └── index.ts        7 accent themes + dark/light surface


────────────────────────────────────────────────────────────────────────────────
  THEMES AND UI
────────────────────────────────────────────────────────────────────────────────

Shulker has 7 accent colour themes:
  1. Crimson  — #E5193A (default, deep red)
  2. Rose     — #F43F5E
  3. Orange   — #F97316
  4. Violet   — #8B5CF6
  5. Cyan     — #06B6D4
  6. Green    — #22C55E
  7. Gold     — #EAB308

Each theme has a dark and light surface mode.
Theme is saved to localStorage and applied instantly on load.

The design system uses CSS custom properties (--accent, --bg-base, etc.)
so every component picks up theme changes without re-rendering.

Fonts:
  • Plus Jakarta Sans — body text, UI
  • DM Sans — headings, display
  • JetBrains Mono — code, keyboard shortcuts

All corners are rounded (no sharp edges anywhere in the UI).
Animations use Framer Motion with iOS-style spring physics.


────────────────────────────────────────────────────────────────────────────────
  SPLASH SCREEN
────────────────────────────────────────────────────────────────────────────────

On first load (or after 30 minutes of not using the app):
  • Black screen fades in
  • anim-logo.mp4 plays (5 seconds, your animated logo)
  • "MUSIC. DOWNLOADED. PLAYED." fades in below
  • A red progress bar sweeps across the bottom in sync with the video
  • "tap to skip" appears after 2 seconds
  • App loads automatically when video ends

The 30-minute cooldown is stored in localStorage under 'shulker-splash-last'.
The splash only shows on reload, never during navigation within the app.


────────────────────────────────────────────────────────────────────────────────
  PLAYER
────────────────────────────────────────────────────────────────────────────────

The player is built on Howler.js in html5 streaming mode.

Key design decisions:
  • Single global Howl instance (module-level, not component-level)
    This means one audio stream. No piling, no doubling, no warping.
  • html5: true is required for streaming. Without it, Howler tries to
    download the full file before playing, which never finishes on a stream.
  • No format hints — the stream.py always returns Content-Type: audio/mpeg
    so Howler and the browser sniff the format correctly.
  • loadAndPlay() has empty dependency array — it never recreates,
    uses refs for volume/callbacks to avoid stale closures.
  • Progress updates every 250ms for smooth slider movement.

PlayerBar appears only when a track is loaded. Never shown on empty state.

Controls:
  • Play / Pause
  • Previous (or restart if more than 3 seconds in)
  • Next
  • Shuffle (Fisher-Yates shuffle of queue)
  • Repeat: off → all → one (cycles)
  • Volume slider + mute
  • Like button (syncs to API)
  • Three-dot menu: like, download, lyrics, queue
  • Progress bar with seek
  • Tap artwork → opens fullscreen Now Playing

Keyboard shortcuts:
  Space       Play / Pause
  ← →         Seek ±10 seconds
  ↑ ↓         Volume ±10%
  N           Next track
  P           Previous track
  R           Cycle repeat mode
  S           Toggle shuffle
  Q           Toggle queue panel
  L           Toggle lyrics panel
  M           Mute / unmute
  F           Fullscreen player
  Ctrl+F      Focus search


────────────────────────────────────────────────────────────────────────────────
  SEARCH
────────────────────────────────────────────────────────────────────────────────

Search is instant at two levels:

1. SUGGESTIONS (80ms debounce)
   As you type, /api/search/suggest is called.
   ytmusicapi.get_search_suggestions() returns in ~80ms.
   Results appear in a dropdown below the search bar.
   Tap a suggestion to immediately fill and search.

2. FULL SEARCH (200ms debounce)
   Returns tracks, albums, artists, playlists.
   Filter pills (All / Tracks / Albums / Artists / Playlists) narrow results.
   All 4 category searches run concurrently via asyncio.gather().

URL detection is instant (no debounce):
  • Spotify URL → resolves via Spotify API + YouTube Music match
  • YouTube URL → extracts video ID, fetches track info
  • SoundCloud, Bandcamp, etc. → yt-dlp info extraction
  • Any http/https URL → attempted via yt-dlp

When a URL is pasted, results replace placeholder UI with real data
(artwork, title, artist, duration) pulled from the actual source.


────────────────────────────────────────────────────────────────────────────────
  DOWNLOADS
────────────────────────────────────────────────────────────────────────────────

The Downloads page has 4 tabs (no scrolling needed between them):

  Active   — currently downloading/converting/tagging (with live progress bar)
  Queued   — waiting to start
  Saved    — completed downloads (persisted in localStorage)
  Errors   — failed downloads with error message + retry button

Progress updates arrive via Socket.IO WebSocket in real time.
When a download completes, rhea.mp3 plays as a notification.

Formats available: MP3, FLAC, OPUS, M4A, WAV
Quality options:  128kbps, 192kbps, 256kbps, 320kbps, Best available

Each download job:
  → Resolves the track to a YouTube URL
  → Downloads best audio quality via yt-dlp
  → Converts via ffmpeg to chosen format
  → Writes ID3 tags (title, artist, album, artwork, lyrics) via mutagen
  → Saves to DOWNLOADS_DIR
  → Appears in Library automatically on next scan


────────────────────────────────────────────────────────────────────────────────
  SETTINGS — 9 SECTIONS
────────────────────────────────────────────────────────────────────────────────

Settings is a two-panel layout (list on left, content on right).
On mobile it navigates between the two panels.

1. APPEARANCE
   • 7 accent colour swatches (live preview)
   • Dark / Light surface toggle
   • Compact mode, show album art, animations toggles

2. AUDIO
   • Crossfade, volume normalisation, gapless playback toggles
   • Streaming quality selector (128 / 192 / 256 / 320 kbps)
   • Equalizer link (planned)

3. DOWNLOADS
   • Default format radio group
   • Default quality radio group
   • Embed artwork / embed lyrics / Wi-Fi only toggles
   • Concurrent downloads counter (1–8, tap +/-)

4. STORAGE
   • Music directories list with active/inactive toggles
   • Add custom directory input
   • Library rescan, export
   • Cache size display + clear button

5. ACCOUNT
   • Display name and avatar
   • Spotify credentials input (Client ID + Secret)
     → Saved to localStorage AND posted to /api/settings/spotify
     → Backend writes to .env and hot-reloads settings
     → Token cache cleared so new creds take effect immediately
     → Shows connection status (green dot if connected)

6. PRIVACY
   • Save play history toggle
   • Save search history toggle
   • Clear history buttons
   • Anonymous analytics toggle (off by default)
   • Links to Terms and Privacy policy

7. NOTIFICATIONS
   • Download complete toggle
   • Download failed toggle
   • Sound effects toggle (rhea.mp3)
   • App update toggle

8. SHORTCUTS
   • Full keyboard shortcut reference table

9. ABOUT
   • App version, built-by credit
   • Full dependency list with versions
   • GitHub link, bug report link
   • Terms, Privacy, Licences links
   • Clear all app data button (localStorage.clear())


────────────────────────────────────────────────────────────────────────────────
  LOCALSTORAGE — WHAT IS SAVED
────────────────────────────────────────────────────────────────────────────────

Key                     What it stores
─────────────────────── ───────────────────────────────────────────────────────
shulker-theme           Accent colour + surface (dark/light)
shulker-volume          Volume level + mute state
shulker-downloads       Completed download jobs (persisted across sessions)
shulker-liked           Liked track IDs (also synced to API)
shulker-user            Username and display preferences
shulker-splash-last     Timestamp of last splash screen show
shulker-spotify-*       Spotify Client ID and Secret

Nothing else is stored. No tracking, no analytics, no external calls
other than the APIs listed above.


────────────────────────────────────────────────────────────────────────────────
  DEPLOYMENT — RENDER
────────────────────────────────────────────────────────────────────────────────

Both services are deployed on Render using render.yaml (Blueprint):

  shulker-api (Python web service)
    Build: pip install -e .
    Start: uvicorn app.main:socket_app --host 0.0.0.0 --port $PORT
    Env vars to set manually in Render dashboard:
      SPOTIFY_CLIENT_ID     — your Spotify app client ID
      SPOTIFY_CLIENT_SECRET — your Spotify app client secret
      MUSIC_DIR             — /tmp/shulker/music (Render ephemeral disk)
      DOWNLOADS_DIR         — /tmp/shulker/downloads

  shulker-web (Static site)
    Build: npm install && npx vite build
    Publish: dist/
    Note: In production, the frontend calls the Render API URL directly.
          The Vite proxy only works in local development.

Important Render limitations:
  • Free tier sleeps after 15 minutes of inactivity
  • First request after sleep takes ~30 seconds (cold start)
  • Downloads on Render write to /tmp which is wiped on restart
  • For permanent downloads, run the API locally on Termux

For 24/7 reliable downloads: run the API locally on Termux,
use Render only for the public-facing web interface.


────────────────────────────────────────────────────────────────────────────────
  LOCAL DEVELOPMENT (TERMUX / LINUX / MAC)
────────────────────────────────────────────────────────────────────────────────

Requirements:
  • Python 3.13+
  • Node.js 18+
  • ffmpeg (pkg install ffmpeg on Termux)
  • yt-dlp (included in pip install)

Backend:
  cd api
  source .venv/bin/activate
  pip install -e . --break-system-packages
  cp .env.example .env
  # Edit .env with your Spotify credentials and paths
  uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload

Frontend:
  cd web
  npm install
  npm run dev
  # Opens at http://localhost:3000

CLI:
  # After pip install -e ., the 'shulker' command is available:
  shulker              # interactive REPL
  shulker health       # check API status
  shulker search "kendrick lamar"
  shulker dl "not like us"
  shulker dl "https://open.spotify.com/track/..."
  shulker dl "https://youtu.be/abc123" --format=flac --quality=best
  shulker dls          # list all download jobs
  shulker status <id>  # check job status
  shulker lyrics <id>  # fetch lyrics
  shulker lib          # browse local library


────────────────────────────────────────────────────────────────────────────────
  SPOTIFY CREDENTIALS — HOW TO GET THEM
────────────────────────────────────────────────────────────────────────────────

Shulker uses the Spotify Web API for metadata only. It is free.
You need your own credentials because Spotify does not provide a public key.

Steps:
  1. Go to https://developer.spotify.com/dashboard
  2. Log in with any Spotify account (free is fine)
  3. Click "Create app"
  4. Name: Shulker (or anything)
  5. Redirect URI: http://localhost:3000
  6. Check "Web API"
  7. Save
  8. Copy the Client ID and Client Secret from the app settings page
  9. In Shulker: Settings → Account → paste both fields → Save

What Spotify credentials unlock in Shulker:
  • Paste a Spotify track link → get exact song + Spotify artwork
  • Paste a Spotify album link → get the full album track list
  • Paste a Spotify playlist link → get all tracks, ready to play/download
  • Paste a Spotify artist link → get their top tracks and albums
  • Richer artwork (Spotify's images are higher quality than YouTube's)
  • Correct duration metadata from Spotify's database

Without credentials:
  • Search still works fully (YouTube Music)
  • Spotify links give an error
  • Everything else works normally


────────────────────────────────────────────────────────────────────────────────
  API ENDPOINTS
────────────────────────────────────────────────────────────────────────────────

All prefixed with /api. Full docs at http://localhost:8000/api/docs

HEALTH
  GET  /api/health                    Server status, version, dirs, Spotify status

SEARCH
  GET  /api/search?q=...&filter=...   Full search (tracks/albums/artists/playlists)
  GET  /api/search/suggest?q=...      Instant autocomplete suggestions
  POST /api/search/resolve            Resolve a Spotify/YouTube/any URL

TRACKS
  GET  /api/tracks                    List all local tracks
  GET  /api/tracks/liked              Get liked track IDs
  GET  /api/tracks/recently-played    Get play history
  GET  /api/tracks/{id}               Get a single track (local or YouTube)
  POST /api/tracks/{id}/like          Like a track
  DEL  /api/tracks/{id}/like          Unlike a track
  POST /api/tracks/{id}/play          Record a play event

STREAM
  GET  /api/stream/{id}/audio         Stream audio (live or local file)
  HEAD /api/stream/{id}/audio         Check if stream exists
  GET  /api/stream/{id}/artwork       Get embedded artwork from local file

DOWNLOADS
  POST /api/downloads                 Start a download job
  GET  /api/downloads                 List all jobs
  GET  /api/downloads/{id}            Get job status
  POST /api/downloads/{id}/cancel     Cancel a job
  POST /api/downloads/{id}/retry      Retry a failed job
  DEL  /api/downloads/{id}            Remove a job record

LYRICS
  GET  /api/lyrics/{id}?title=&artist= Fetch synced or plain lyrics

PLAYLISTS
  GET  /api/playlists                 List all playlists
  POST /api/playlists                 Create a playlist
  GET  /api/playlists/{id}            Get playlist
  PATCH /api/playlists/{id}           Update playlist
  DEL  /api/playlists/{id}            Delete playlist
  POST /api/playlists/{id}/tracks     Add track to playlist
  DEL  /api/playlists/{id}/tracks/{tid} Remove track
  POST /api/playlists/{id}/import     Import from Spotify URL

SETTINGS
  POST /api/settings/spotify          Save Spotify credentials (writes to .env)
  GET  /api/settings/spotify/status   Check if Spotify is connected


────────────────────────────────────────────────────────────────────────────────
  VERSION HISTORY
────────────────────────────────────────────────────────────────────────────────

v1.0.0   Clean slate — fresh repo, config scaffold
v1.1.0   Full stack wired — search, stream, download, lyrics, websocket
v1.2.0   Playback fixes, non-blocking ytmusicapi, suggestions endpoint
v1.2.1   Audio piling fix, html5 streaming, same-track restart
v1.2.2   Audio context unlock, Render deployment config
v1.2.3   CORS wildcard, hardcoded Render URL, docs (privacy, terms, security)
v1.2.4   All assets wired — anim-logo.mp4, logo.png, favicon, rhea.mp3
v1.2.5   ffmpeg pipe stream (fixes null stream on Termux), downloads tabs,
         real data on Home, localStorage persistence, page folder structure


────────────────────────────────────────────────────────────────────────────────
  ROADMAP
────────────────────────────────────────────────────────────────────────────────

v1.3.0   Onboarding modal (Spotify creds on first load)
         Library wired to real API data
         LikedSongs wired to real API data
         Like button fully functional end to end

v1.4.0   Playlist CRUD fully working in UI
         Album and Artist pages with real data
         Now Playing dynamic background colour from artwork

v1.5.0   Equalizer UI
         Audio visualizer (bar + wave)
         Multiple user profiles

v1.6.0   PWA — installable on Android home screen
         Offline playback for downloaded tracks
         Background sync

v2.0.0   Stable release
         Full test coverage
         Production hardened


────────────────────────────────────────────────────────────────────────────────
  LICENCE
────────────────────────────────────────────────────────────────────────────────

MIT License. See LICENSE file.

The MIT licence applies to the Shulker code only.
It does not grant rights to audio content downloaded using Shulker.
You are responsible for complying with copyright law in your jurisdiction.


────────────────────────────────────────────────────────────────────────────────
  BUILT BY
────────────────────────────────────────────────────────────────────────────────

LethaboK
GitHub: https://github.com/lethabokhedama-png
Project: https://github.com/lethabokhedama-png/shulker

Built on Termux (Android), deployed on Render.
Developed with Claude (Anthropic) as a coding partner.

================================================================================
