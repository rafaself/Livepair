.PHONY: help observability-api observability-up observability-down observability-restart observability-urls postgres-up postgres-down postgres-reset postgres-logs smoke-check

POSTGRES_COMPOSE_FILE := infra/postgres/docker-compose.yml
SMOKE_ENV_FILE ?= .env

help:
	@printf '%s\n' \
		'Available targets:' \
		'  make postgres-up            Start local PostgreSQL in Docker' \
		'  make postgres-down          Stop local PostgreSQL in Docker' \
		'  make postgres-reset         Recreate the local PostgreSQL volume from scratch' \
		'  make postgres-logs          Tail local PostgreSQL logs' \
		'  make smoke-check           Validate local smoke-test prerequisites' \
		'  make observability-api      Start the API on 0.0.0.0 for Prometheus scraping' \
		'  make observability-up       Start the local Prometheus + Grafana stack' \
		'  make observability-down     Stop the local Prometheus + Grafana stack' \
		'  make observability-restart  Restart the local Prometheus + Grafana stack' \
		'  make observability-urls     Print the local observability URLs and login'

postgres-up:
	docker compose -f $(POSTGRES_COMPOSE_FILE) up -d

postgres-down:
	docker compose -f $(POSTGRES_COMPOSE_FILE) down

postgres-reset:
	docker compose -f $(POSTGRES_COMPOSE_FILE) down -v
	docker compose -f $(POSTGRES_COMPOSE_FILE) up -d

postgres-logs:
	docker compose -f $(POSTGRES_COMPOSE_FILE) logs -f postgres

smoke-check:
	@command -v pnpm >/dev/null 2>&1 || { echo "pnpm is not installed. Install pnpm first."; exit 1; }
	@test -d node_modules || { echo "Dependencies are missing. Run: pnpm install"; exit 1; }
	@test -f "$(SMOKE_ENV_FILE)" || { echo "Missing $(SMOKE_ENV_FILE). Copy .env.example first."; exit 1; }
	@grep -Eq '^GEMINI_API_KEY=.+$$' "$(SMOKE_ENV_FILE)" || { echo "Missing GEMINI_API_KEY in $(SMOKE_ENV_FILE). Set it before local validation."; exit 1; }
	@docker compose ps postgres 2>/dev/null | grep -q 'running' || { echo "Local infra is not up. Start it with: docker compose up -d"; exit 1; }
	@DOTENV_CONFIG_PATH="$(SMOKE_ENV_FILE)" pnpm --filter @livepair/api db:check
	@printf '%s\n' 'Smoke preflight passed.' 'Next: pnpm run dev'

observability-api:
	HOST=0.0.0.0 pnpm --filter @livepair/api dev

observability-up:
	docker compose -f infra/observability/docker-compose.yml up -d

observability-down:
	docker compose -f infra/observability/docker-compose.yml down

observability-restart: observability-down observability-up

observability-urls:
	@printf '%s\n' \
		'Prometheus: http://127.0.0.1:9090/targets' \
		'Grafana: http://127.0.0.1:3001' \
		'Grafana login: admin / admin' \
		'Dashboard: Livepair API Overview'
