# Shulker

Premium self-hosted music player powered by spotdl.

## Stack
- **API**: Python 3.12 · FastAPI · Celery · Redis
- **Web**: React 18 · TypeScript · Vite · Tailwind CSS · Howler.js
- **Infra**: Docker Compose · Nginx

## Quick start
```bash
cp api/.env.example api/.env
docker compose up --build
```
Open http://localhost:3000
