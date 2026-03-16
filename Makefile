.PHONY: help observability-api observability-up observability-down observability-restart observability-urls postgres-up postgres-down postgres-reset postgres-logs smoke-check

POSTGRES_COMPOSE_FILE := infra/postgres/docker-compose.yml
POSTGRES_ENV_FILE ?= infra/postgres/.env
API_ENV_FILE ?= apps/api/.env
POSTGRES_COMPOSE := docker compose --env-file $(POSTGRES_ENV_FILE) -f $(POSTGRES_COMPOSE_FILE)

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
	@test -f "$(POSTGRES_ENV_FILE)" || { echo "Missing $(POSTGRES_ENV_FILE). Copy infra/postgres/.env.example first."; exit 1; }
	$(POSTGRES_COMPOSE) up -d

postgres-down:
	@test -f "$(POSTGRES_ENV_FILE)" || { echo "Missing $(POSTGRES_ENV_FILE). Copy infra/postgres/.env.example first."; exit 1; }
	$(POSTGRES_COMPOSE) down

postgres-reset:
	@test -f "$(POSTGRES_ENV_FILE)" || { echo "Missing $(POSTGRES_ENV_FILE). Copy infra/postgres/.env.example first."; exit 1; }
	$(POSTGRES_COMPOSE) down -v
	$(POSTGRES_COMPOSE) up -d

postgres-logs:
	@test -f "$(POSTGRES_ENV_FILE)" || { echo "Missing $(POSTGRES_ENV_FILE). Copy infra/postgres/.env.example first."; exit 1; }
	$(POSTGRES_COMPOSE) logs -f postgres

smoke-check:
	@command -v pnpm >/dev/null 2>&1 || { echo "pnpm is not installed. Install pnpm first."; exit 1; }
	@test -d node_modules || { echo "Dependencies are missing. Run: pnpm install"; exit 1; }
	@test -f "$(API_ENV_FILE)" || { echo "Missing $(API_ENV_FILE). Copy apps/api/.env.example first."; exit 1; }
	@test -f "$(POSTGRES_ENV_FILE)" || { echo "Missing $(POSTGRES_ENV_FILE). Copy infra/postgres/.env.example first."; exit 1; }
	@grep -Eq '^GEMINI_API_KEY=.+$$' "$(API_ENV_FILE)" || { echo "Missing GEMINI_API_KEY in $(API_ENV_FILE). Set it before local validation."; exit 1; }
	@$(POSTGRES_COMPOSE) ps --status running --services postgres 2>/dev/null | grep -qx 'postgres' || { echo "Local infra is not up. Start it with: make postgres-up"; exit 1; }
	@DOTENV_CONFIG_PATH="$(API_ENV_FILE)" pnpm --filter @livepair/api db:check
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
