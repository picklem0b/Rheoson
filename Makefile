.PHONY: dev build test typecheck lint engine relay clean

# The experiment workspace. `pnpm dev` runs client + server in parallel;
# the engine and relay are the two services you start by hand when you
# need them (downloads, streaming) — see README Quick Start.

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

typecheck:
	pnpm typecheck

lint:
	pnpm lint

engine:
	cd apps/services/py && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

relay:
	cd apps/services/go && go run ./cmd/relay

clean:
	git clean -fdx -e node_modules -e .env
