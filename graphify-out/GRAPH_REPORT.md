# Graph Report - shulker  (2026-08-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 856 nodes · 2005 edges · 93 communities (63 shown, 30 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.53)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0dd9aff7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- search_service.py
- Track
- useDownloads.ts
- Settings.tsx
- dependencies
- formatDuration
- tracks.py
- router.tsx
- usePlayerStore
- utils.ts
- cli.py
- stream.py
- compilerOptions
- main.py
- playlists.py
- download_service.py
- downloads.py
- cn
- IconButton.tsx
- get_lyrics
- NowPlaying.tsx
- App.tsx
- Library.tsx
- compilerOptions
- ConnectionManager
- FastAPI
- org.junit.Test
- devDependencies
- git-tags.sh
- GridListViews.tsx
- Settings
- gradlew
- ArtistView.tsx
- com.getcapacitor.BridgeActivity
- useAudioAnalyser.ts
- sw.ts
- eslint
- eslint-plugin-react-hooks
- eslint-plugin-react-refresh
- postcss
- tailwindcss
- @types/howler
- @types/react
- @types/react-dom
- typescript
- @typescript-eslint/eslint-plugin
- @typescript-eslint/parser
- vite
- vite-plugin-pwa
- @vitejs/plugin-react
- capacitor.config.ts
- workbox-background-sync
- workbox-cacheable-response
- workbox-core
- workbox-expiration
- workbox-range-requests
- workbox-routing
- workbox-strategies
- workbox-window
- shulker-api
- {
  getAlbums,
  getAlbum,
  getArtists,
  getArtist,
  getFeatured,
}
- {
  getPlaylists,
  getPlaylist,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addTrack,
  removeTrack,
  reorderTracks,
  importSpotify,
}

## God Nodes (most connected - your core abstractions)
1. `cn()` - 102 edges
2. `usePlayerStore` - 38 edges
3. `Track` - 36 edges
4. `formatDuration()` - 27 edges
5. `useQueue()` - 26 edges
6. `usePlayer()` - 19 edges
7. `compilerOptions` - 18 edges
8. `ScrollArea` - 17 edges
9. `IconButton` - 16 edges
10. `cmd_interactive()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `PlaylistSchema` --uses--> `TrackSchema`  [INFERRED]
  api/app/schemas/playlist.py → api/app/schemas/track.py
- `_resolve_to_yt_url()` --indirect_call--> `_info()`  [INFERRED]
  api/app/services/download_service.py → api/app/cli.py
- `TrendingRow()` --calls--> `formatDuration()`  [EXTRACTED]
  web/src/pages/home/components/HomeSections.tsx → web/src/lib/formatters.ts
- `delete_download()` --references--> `_delete()`  [EXTRACTED]
  api/app/routers/downloads.py → api/app/cli.py
- `Modal()` --calls--> `cn()`  [EXTRACTED]
  web/src/components/ui/Modal.tsx → web/src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (93 total, 30 thin omitted)

### Community 0 - "search_service.py"
Cohesion: 0.05
Nodes (75): DownloadError, generic_exception_handler(), NotFoundError, Request, Base exception for all Shulker errors., SearchError, shulker_exception_handler(), ShulkerException (+67 more)

### Community 1 - "Track"
Cohesion: 0.06
Nodes (43): api, ApiError, BODY_FREE, buildUrl(), isAbortError(), makeError(), request(), RequestOptions (+35 more)

### Community 2 - "useDownloads.ts"
Cohesion: 0.06
Nodes (44): downloadsApi, icons, styles, Toast(), ToastData, ToastProps, ToastType, playRhea() (+36 more)

### Community 3 - "Settings.tsx"
Cohesion: 0.11
Nodes (32): usePersisted(), APP_VERSION, RadioGroup(), SettingsGroup(), SettingsRow(), Slider(), Toggle(), AboutSection() (+24 more)

### Community 4 - "dependencies"
Cohesion: 0.04
Nodes (44): @capacitor/android, @capacitor/core, clsx, framer-motion, howler, lucide-react, react, react-dom (+36 more)

### Community 5 - "formatDuration"
Cohesion: 0.12
Nodes (24): tracksApi, TopBar(), TopBarProps, Button, ButtonProps, ScrollArea, ScrollAreaProps, Skeleton() (+16 more)

### Community 6 - "tracks.py"
Cohesion: 0.12
Nodes (33): _build_index(), clear_history(), get_liked(), get_liked_count(), get_recently_played(), get_track(), get_trending(), _history_file() (+25 more)

### Community 7 - "router.tsx"
Cohesion: 0.11
Nodes (23): libraryApi, useToast(), useQueue(), Album(), Artist(), Downloads(), Featured(), FeaturedCard() (+15 more)

### Community 8 - "usePlayerStore"
Cohesion: 0.19
Nodes (18): PlayerControls(), PlayerControlsProps, PlayPauseButtonProps, ProgressBar(), ProgressBarProps, VolumeControl(), Slider(), SliderProps (+10 more)

### Community 9 - "utils.ts"
Cohesion: 0.11
Nodes (16): Badge(), BadgeProps, Spinner(), SpinnerProps, detectInputType(), isSpotifyUrl(), isYouTubeUrl(), shuffle() (+8 more)

### Community 10 - "cli.py"
Cohesion: 0.31
Nodes (24): cmd_cancel(), cmd_download(), cmd_downloads(), cmd_health(), cmd_interactive(), cmd_library(), cmd_lyrics(), cmd_resolve() (+16 more)

### Community 11 - "stream.py"
Cohesion: 0.13
Nodes (23): _build_cache_sync(), _ensure_cache(), _find_local(), get_artwork(), get, Path, Request, Response (+15 more)

### Community 12 - "compilerOptions"
Cohesion: 0.08
Nodes (24): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules (+16 more)

### Community 13 - "main.py"
Cohesion: 0.12
Nodes (17): configure_logging(), _cron_job_cleanup(), _cron_ytdlp_update(), health(), library_albums(), library_artists(), library_featured(), lifespan() (+9 more)

### Community 14 - "playlists.py"
Cohesion: 0.20
Nodes (20): _delete(), add_track(), create_playlist(), delete_playlist(), get_playlist(), import_spotify(), list_playlists(), _load() (+12 more)

### Community 15 - "download_service.py"
Cohesion: 0.18
Nodes (17): AbstractEventLoop, _cron_library_scan(), Invalidate both caches. The next request to /tracks or /api/stream/* will…, invalidate_stream_cache(), Call after a download completes so the new file is found immediately., invalidate_track_index(), Blow away the in-memory track index so the next request rebuilds it. Called by…, _download_task() (+9 more)

### Community 16 - "downloads.py"
Cohesion: 0.18
Nodes (16): cancel_download(), delete_download(), get_download(), list_downloads(), get, retry_download(), start_download(), DownloadJobSchema (+8 more)

### Community 17 - "cn"
Cohesion: 0.19
Nodes (12): BottomNav(), NAV_ITEMS, RootLayout(), NAV_ITEMS, Sidebar(), PlayerBar(), PlayPauseButton(), Tooltip() (+4 more)

### Community 18 - "IconButton.tsx"
Cohesion: 0.18
Nodes (11): QueueItem(), IconButton, IconButtonProps, Modal(), ModalProps, truncate(), DownloadRow(), STATUS_CONFIG (+3 more)

### Community 19 - "get_lyrics"
Cohesion: 0.28
Nodes (12): fetch_lyrics(), get, LyricsLineSchema, LyricsSchema, BaseModel, _fetch_plain(), _fetch_synced(), get_lyrics() (+4 more)

### Community 20 - "NowPlaying.tsx"
Cohesion: 0.20
Nodes (11): QueuePanel(), useLyrics(), ContextSheet(), LyricsTab(), MENU_ITEMS, NowPlaying(), PlaylistTab(), Tab (+3 more)

### Community 21 - "App.tsx"
Cohesion: 0.26
Nodes (9): App(), AppInner(), SplashScreen(), SplashScreenProps, useSplash(), useKeyboardShortcuts(), useMediaSession(), queryClient (+1 more)

### Community 22 - "Library.tsx"
Cohesion: 0.24
Nodes (7): ArtistGrid(), gradient(), GRADIENTS, GridView(), LibTab, ListView(), TABS

### Community 23 - "compilerOptions"
Cohesion: 0.22
Nodes (8): vite.config.ts, compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 24 - "ConnectionManager"
Cohesion: 0.36
Nodes (3): Any, ConnectionManager, Thin wrapper around the Socket.IO server instance. Imported by services to emit…

### Community 25 - "FastAPI"
Cohesion: 0.29
Nodes (7): BaseModel, get, Write Spotify credentials to .env so they persist across restarts. Called by…, save_spotify_creds(), spotify_status(), SpotifyCredsSchema, FastAPI

### Community 26 - "org.junit.Test"
Cohesion: 0.36
Nodes (4): org.junit.runner.RunWith, org.junit.Test, ExampleInstrumentedTest, ExampleUnitTest

### Community 27 - "devDependencies"
Cohesion: 0.29
Nodes (7): autoprefixer, @capacitor/cli, devDependencies, autoprefixer, @capacitor/cli, workbox-precaching, workbox-precaching

### Community 28 - "git-tags.sh"
Cohesion: 0.67
Nodes (5): err(), log(), ok(), git-tags.sh script, tag()

### Community 29 - "GridListViews.tsx"
Cohesion: 0.33
Nodes (5): GRADIENTS, GridView(), GridViewProps, ListView(), ListViewProps

### Community 31 - "gradlew"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 32 - "ArtistView.tsx"
Cohesion: 0.50
Nodes (3): ArtistView(), ArtistViewProps, GRADIENTS

## Knowledge Gaps
- **167 isolated node(s):** `ApiError`, `RequestOptions`, `FeaturedItem`, `LyricsLine`, `LyricsResponse` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `ArtistView.tsx`, `Track`, `useDownloads.ts`, `Settings.tsx`, `formatDuration`, `router.tsx`, `usePlayerStore`, `utils.ts`, `IconButton.tsx`, `NowPlaying.tsx`, `Library.tsx`, `GridListViews.tsx`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `Track` connect `Track` to `useDownloads.ts`, `formatDuration`, `router.tsx`, `usePlayerStore`, `utils.ts`, `IconButton.tsx`, `NowPlaying.tsx`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `_post()` connect `cli.py` to `search_service.py`, `tracks.py`, `playlists.py`, `downloads.py`, `FastAPI`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `ApiError`, `RequestOptions`, `FeaturedItem` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `search_service.py` be split into smaller, more focused modules?**
  _Cohesion score 0.05268414481897628 - nodes in this community are weakly interconnected._
- **Should `Track` be split into smaller, more focused modules?**
  _Cohesion score 0.06291591046581972 - nodes in this community are weakly interconnected._
- **Should `useDownloads.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.062409288824383166 - nodes in this community are weakly interconnected._