# Shulker Application Architecture

## Overview

The Shulker application is a full-stack music discovery and management platform built with a Python backend (FastAPI) and a React frontend (Vite). The system provides features for searching, playing, downloading, and managing music tracks, albums, playlists, and artists. The architecture is organized into distinct layers: data storage, business logic services, API endpoints, and client-side UI components.

## Repository Structure

```
shulker/
├── api/                 # Backend REST API (FastAPI)
│   ├── app/             # Main application package
│   │   ├── __init__.py
│   │   ├── core/        # Core configuration, logging, exceptions
│   │   ├── config.py    # Configuration settings
│   │   ├── exceptions.py # Custom exception classes
│   │   ├── main.py      # Application entry point
│   │   ├── routers/     # API route handlers
│   │   │   ├── downloads.py
│   │   │   ├── lyrics.py
│   │   │   ├── playlists.py
│   │   │   ├── search.py
│   │   │   ├── settings.py
│   │   │   ├── streams.py
│   │   │   └── tracks.py
│   │   └── schemas/     # Pydantic data models
│   │       ├── download.py
│   │       ├── lyrics.py
│   │       ├── playlist.py
│   │       ├── search.py
│   │       └── track.py
│   ├── pyproject.toml   # Python project configuration
│   ├── requirements.txt # Dependencies
│   ├── run_cli.py       # CLI entry point
│   └── Dockerfile       # Container definition
├── web/                # Frontend React application
│   ├── src/            # Source code
│   │   ├── App.tsx              # Root component
│   │   ├── api/              # API client layer
│   │   │   ├── client.ts
│   │   │   ├── downloads.ts
│   │   │   ├── library.ts
│   │   │   ├── playlists.ts
│   │   │   ├── search.ts
│   │   │   ├── tracks.ts
│   │   │   └── tabs.ts
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ui/           # Shared UI primitives
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── IconButton.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Skeleton.tsx
│   │   │   │   ├── Slider.tsx
│   │   │   │   ├── ProgressBar.tsx
│   │   │   │   ├── PlayerBar.tsx
│   │   │   │   ├── QueueItem.tsx
│   │   │   │   ├── VolumeControl.tsx
│   │   │   │   ├── Bar/Player controls
│   │   │   │   └── Forms
│   │   │   ├── layout/       # Page layouts
│   │   │   │   ├── BottomNav.tsx
│   │   │   │   ├── RootLayout.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── TopBar.tsx
│   │   │   ├── pages/        # Page-level components
│   │   │   │   ├── HomeSections.tsx
│   │   │   │   ├── ArtistView.tsx
│   │   │   │   ├── Downloads.tsx
│   │   │   │   ├── Library.tsx
│   │   │   │   ├── Tracks.tsx
│   │   │   │   ├── Playlists.tsx
│   │   │   │   └── Search.tsx
│   │   │   ├── store/        # State management
│   │   │   │   ├── downloadStore.ts
│   │   │   │   ├── playerStore.ts
│   │   │   │   ├── queueStore.ts
│   │   │   │   ├── themeStore.ts
│   │   │   │   └── uiStore.ts
│   │   │   └── utils/        # Utility functions
│   │   │       ├── formatters.ts
│   │   │       ├── util.ts
│   │   │       └── helpers.ts
│   │   ├── package.json      # Frontend dependencies
│   │   ├── vite.config.ts    # Vite build configuration
│   │   ├── tailwind.config.ts # CSS framework config
│   │   ├── tsconfig.json     # TypeScript configuration
│   │   └── index.html        # Entry HTML
│   ├── android/             # Capacitor mobile build
│   │   ├── app/              # Android/iOS native code
│   │   ├── android/          # Gradle build files
│   │   └── java/             # Java/Kotlin source
│   └── .github/             # CI/CD workflows
└── docs/                   # Documentation
    ├── CHANGELOG.md
    ├── CONTRIBUTING.md
    ├── INTERNALS.md
    ├── PRIVACY.md
    └── SECURITY.md
```
