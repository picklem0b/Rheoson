# Contributing to Shulker

Thanks for your interest. Shulker is a personal project but contributions are welcome.

---

## Getting started

```bash
git clone https://github.com/lethabokhedama-png/shulker
cd shulker

# API
cd api
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]" --break-system-packages
uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload

# Web (new terminal)
cd web
npm install
npm run dev
```

## Project structure
shulker/
├── api/                    # FastAPI backend
│   └── app/
│       ├── core/           # Config, logging, exceptions
│       ├── routers/        # HTTP endpoints
│       ├── schemas/        # Pydantic models
│       ├── services/       # Business logic
│       └── websocket/      # Socket.IO
├── web/                    # React frontend
│   └── src/
│       ├── api/            # API client functions
│       ├── components/     # UI components
│       ├── hooks/          # React hooks
│       ├── pages/          # Route pages
│       ├── store/          # Zustand stores
│       └── types/          # TypeScript types
└── docs/                   # Documentation

## Rules

- One feature or fix per PR
- No new dependencies without discussion
- TypeScript strict mode — no `any` unless unavoidable
- Python: follow the existing structlog + async patterns
- Test your changes locally before opening a PR
- Update the CHANGELOG

## Commit style

feat: add something new
fix: fix something broken
docs: documentation only
refactor: code change, no feature/fix
chore: build, deps, Config

## What not to contribute

- Features that require paid services
- Anything that facilitates large-scale copyright infringement
- Windows-specific code (Termux/Linux/Mac only)