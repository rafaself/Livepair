# infra/observability AGENTS.md

## Scope
Local Prometheus/Grafana development stack for API metrics.

## Guardrails
- This directory is dev-only observability config, not production infrastructure.
- Prometheus expects the API to be reachable from Docker at `host.docker.internal:3000`; run the local API with `HOST=0.0.0.0`.
- Keep `docker-compose.yml`, the provisioned Grafana assets, and `README.md` aligned when changing local stack behavior.

## Look here first
- `README.md`
- `docker-compose.yml`
- `prometheus/prometheus.yml`

## Verification
- Follow `README.md` and confirm the `livepair-api` Prometheus target comes up `UP`.
