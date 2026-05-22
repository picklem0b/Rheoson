.PHONY: dev build stop logs migrate tag push

dev:
	docker compose up --build

build:
	docker compose build

stop:
	docker compose down

logs:
	docker compose logs -f

shell-api:
	docker compose exec api bash

shell-redis:
	docker compose exec redis redis-cli

tag:
	@read -p "Tag message: " msg; \
	ver=$$(git describe --tags --abbrev=0 2>/dev/null | awk -F. '{printf "%d.%d.%d", $$1, $$2, $$3+1}' || echo "v0.1.0"); \
	git tag -a "$$ver" -m "$$msg"; \
	echo "Tagged $$ver"

push:
	git push origin main --tags
