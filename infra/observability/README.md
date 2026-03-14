# Local observability stack

This directory starts a local Prometheus + Grafana stack against the existing API `GET /metrics` endpoint.

## Services

- Prometheus: `http://127.0.0.1:9090`
- Grafana: `http://127.0.0.1:3001`

Grafana starts with a provisioned Prometheus datasource named `Prometheus`.

## Run

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

## Verify

- Prometheus target `livepair-api` should be `UP`.
- `http://127.0.0.1:9090/graph` can query metrics such as:

  - `livepair_api_http_requests_total`
  - `gemini_auth_token_requests_total`

## Stop

```bash
cd infra/observability
docker compose down
```
