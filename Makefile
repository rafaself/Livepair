.PHONY: help observability-api observability-up observability-down observability-restart observability-urls

help:
	@printf '%s\n' \
		'Available targets:' \
		'  make observability-api      Start the API on 0.0.0.0 for Prometheus scraping' \
		'  make observability-up       Start the local Prometheus + Grafana stack' \
		'  make observability-down     Stop the local Prometheus + Grafana stack' \
		'  make observability-restart  Restart the local Prometheus + Grafana stack' \
		'  make observability-urls     Print the local observability URLs and login'

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
