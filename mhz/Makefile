.PHONY: up down migrate test lint build
up:
	docker compose up --build
down:
	docker compose down
migrate:
	docker compose run --rm backend alembic upgrade head
test:
	cd backend && pytest
lint:
	cd frontend && npm run lint
build:
	cd frontend && npm run build
