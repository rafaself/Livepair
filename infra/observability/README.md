# Local observability stack

This directory starts a local Prometheus + Grafana stack against the existing API `GET /metrics` endpoint.

## Services

- Prometheus: `http://127.0.0.1:9090`
- Grafana: `http://127.0.0.1:3001`

Grafana starts with:

- a provisioned Prometheus datasource named `Prometheus`
- a provisioned dashboard named `Livepair API Overview`

## Run

From the repository root you can use:

```bash
make observability-api
make observability-up
make observability-urls
```

Or run the equivalent commands manually:

1. Start the API with a host binding Docker can reach:

   ```bash
   HOST=0.0.0.0 pnpm --filter @livepair/api dev
   ```

2. In a second terminal, start the local observability stack:

   ```bash
   cd infra/observability
   docker compose up -d
   ```

3. Open:

   - Prometheus: `http://127.0.0.1:9090/targets`
   - Grafana: `http://127.0.0.1:3001`

4. Log in to Grafana with:

   - username: `admin`
   - password: `admin`

5. Open the provisioned dashboard:

   - Dashboards → `Livepair API Overview`

If the dashboard looks empty at first, send a few requests to the API so Prometheus has fresh samples to show.

## Verify

- Prometheus target `livepair-api` should be `UP`.
- `http://127.0.0.1:9090/graph` can query metrics such as:

  - `livepair_api_http_requests_total`
  - `gemini_auth_token_requests_total`

- Grafana should show panels for API health, request rate by route, p95/p99 latency, error rate, Gemini token outcomes, and process memory on `Livepair API Overview`.

## Stop

```bash
make observability-down
```
