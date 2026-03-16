# Terraform base infrastructure

Wave 4 lays the Terraform foundation for Google Cloud under `infra/terraform`, and Wave 5 adds the operational handoff to Cloud Build for API image rollouts.
The scope is still intentionally narrow:

- enable the required Google APIs
- create a regional Artifact Registry repository
- create user-managed service accounts for future runtime and migration flows
- grant narrow IAM needed for those service accounts today
- create Secret Manager secret containers only
- create a Cloud SQL PostgreSQL instance, database, and application user
- deploy the API baseline onto Cloud Run from a configurable bootstrap image reference
- wire non-secret runtime config, Secret Manager-backed env vars, and Cloud SQL attachment for the API service
- add a public Cloud Monitoring uptime check against the deployed API `/health` endpoint
- add a minimal alerting policy for uptime-check failures
- create Gemini Live telemetry log-based metrics from the API's structured Cloud Run logs
- add a small set of metric-based alert policies on top of those telemetry metrics
- check in a Cloud Build pipeline that builds, pushes, and deploys the API image against the existing Cloud Run service

This repo still does **not** create the Cloud Build trigger itself, migration jobs, secret values, or broader rollout orchestration.

## Layout

```text
infra/terraform/
├── envs/
│   └── dev/
└── modules/
    ├── artifact_registry/
    ├── cloud_sql/
    ├── cloud_run/
    ├── monitoring/
    ├── project_services/
    ├── secret_manager/
    └── service_accounts/
```

The `dev` environment root is the working entry point today. A future `prod` root can reuse the same modules with a different `terraform.tfvars` file and, if needed, a different backend.

## Local authentication with ADC

Terraform uses the Google provider's standard Application Default Credentials flow.
Choose one of these local authentication options before running `plan` or `apply`:

### Option 1: `gcloud` user ADC

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_GCP_PROJECT_ID
```

### Option 2: service account key file

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/terraform-admin.json
```

Use an identity that can enable project services and manage Artifact Registry, IAM, Secret Manager, and Cloud SQL in the target project.

## Required inputs

Create a local `terraform.tfvars` file from the example in `infra/terraform/envs/dev`:

```bash
cp infra/terraform/envs/dev/terraform.tfvars.example infra/terraform/envs/dev/terraform.tfvars
```

Required inputs stay intentionally small:

- `project_id`
- `region`
- `environment_name`
- `naming_prefix`
- `database` settings, including sizing, backup/public-IP toggles, and the app user password
- `api_service` settings, including the container image reference and Cloud Run sizing
- optional `api_runtime` overrides for non-secret API env vars
- optional `api_secret_versions` pins if you do not want to use `latest`
- optional `monitoring` overrides for the uptime-check path, cadence, telemetry alert thresholds, and notification channel resource names

Do **not** commit `terraform.tfvars` or any real secret values.
The committed example file keeps `app_user_password` as a placeholder so `plan` remains reviewable.

## Usage

From the repository root:

```bash
terraform -chdir=infra/terraform/envs/dev init
terraform -chdir=infra/terraform/envs/dev validate
terraform -chdir=infra/terraform/envs/dev plan -var-file=terraform.tfvars
```

Optional formatting:

```bash
terraform fmt -recursive infra/terraform
```

Apply only after reviewing the plan carefully:

```bash
terraform -chdir=infra/terraform/envs/dev apply -var-file=terraform.tfvars
```

## Managed resources

The `dev` root now manages:

- required project services: Artifact Registry, IAM, Cloud Logging, Cloud Monitoring, Cloud Run, Secret Manager, Service Usage, and Cloud SQL Admin
- one regional Docker Artifact Registry repository
- two user-managed service accounts: API runtime and future migrator
- project-level IAM for `roles/cloudsql.client`
- secret-level IAM for `roles/secretmanager.secretAccessor`
- three secret containers reserved for later population:
  - `GEMINI_API_KEY`
  - `SESSION_TOKEN_AUTH_SECRET`
  - `DATABASE_URL`
- one PostgreSQL Cloud SQL instance, one application database, and one application user
- one Cloud Run v2 service for the API, attached to the API runtime service account
- optional public `roles/run.invoker` access when `api_service.allow_unauthenticated = true`
- one public Cloud Monitoring uptime check against the deployed API health endpoint
- one Cloud Monitoring alert policy that opens when the uptime check stops passing
- seven Gemini Live telemetry log-based metrics scoped to the API Cloud Run service logs
- three Gemini Live metric-based alert policies for error spikes, missing session starts, and high connect latency

For the current dev foundation, the example settings keep Cloud SQL on public IPv4 and leave backups disabled so the environment stays inexpensive and does not pull VPC/private-service networking into scope.
Revisit those two knobs before any broader rollout.

## Monitoring the deployed API

The current stack keeps monitoring intentionally small and demo-friendly:

- Terraform creates a public HTTPS uptime check against the Cloud Run service URL from `terraform output -raw api_cloud_run_service_url`
- the monitored path defaults to `/health`
- the uptime check runs every `60s` by default with a `10s` timeout
- the alert policy opens when the uptime metric reports failures for `120s`
- Terraform also creates Gemini Live telemetry log-based metrics from structured Cloud Run logs where:
  - `resource.type="cloud_run_revision"`
  - `resource.labels.service_name` matches the Terraform-managed API service
  - `resource.labels.location` matches the environment region
  - `jsonPayload.component="live-telemetry"`
  - `jsonPayload.message="Accepted Gemini Live telemetry event"`

This keeps the demo behavior easy to explain: "if the public health endpoint stops passing, Cloud Monitoring opens an incident."
For Gemini Live, the same accepted telemetry logs now back a small set of charts and alert policies without adding a second telemetry pipeline.

Useful outputs after apply:

- `api_uptime_check_name`
- `api_alert_policy_name`
- `api_telemetry_metric_types`
- `api_telemetry_alert_policy_names`
- `api_monitoring`

`api_monitoring` includes the monitored URL/path, the uptime check ID/name, the uptime alert policy name, the base telemetry log filter, the telemetry metric types, the telemetry alert policy names, and a `notification_setup_required` flag that is `true` when no notification channels were attached.

### Gemini Live telemetry metrics

Terraform creates these project-scoped user-defined log-based metrics:

- `live_session_started_count`: counter for accepted `live_session_started` events
- `live_session_error_count`: counter for accepted `live_session_error` events
- `live_session_resume_count`: counter for accepted `live_session_resumed` events
- `live_session_duration_ms`: distribution extracted from `jsonPayload.durationMs` on `live_session_ended`
- `live_session_total_tokens`: distribution extracted from `jsonPayload.usage.totalTokenCount` on `live_usage_reported`
- `live_connect_latency_ms`: distribution extracted from `jsonPayload.connectLatencyMs` on `live_session_connected` and `live_session_resumed`
- `live_first_response_latency_ms`: distribution extracted from `jsonPayload.firstResponseLatencyMs` on `live_session_ended`

To keep the first dashboard useful without creating a cardinality problem, each metric only extracts these labels:

- `environment`
- `platform`
- `model`
- `app_version`

This intentionally excludes `sessionId`, `chatId`, `errorMessage`, and other high-cardinality fields.

### Gemini Live telemetry alerts

Terraform creates these metric-based alert policies:

- `Gemini Live telemetry error spike`: opens when the summed `live_session_error_count` exceeds `monitoring.telemetry_error_spike_threshold` within `monitoring.telemetry_error_spike_alignment_period`
- `Gemini Live telemetry session starts absent`: opens when no `live_session_started_count` samples are observed for `monitoring.telemetry_started_absence_duration`
- `Gemini Live telemetry connect latency high`: opens when the p95 `live_connect_latency_ms` exceeds `monitoring.telemetry_connect_latency_threshold_ms` over `monitoring.telemetry_connect_latency_alignment_period`

The "session starts absent" policy is the MVP approximation of an abrupt drop in starts. It is intentionally simple and works well for demos or low-volume environments, but you should revisit the thresholding strategy once you have a stable traffic baseline.

### Viewing the telemetry metrics in Cloud Monitoring

In the Google Cloud console:

1. Open **Monitoring** -> **Metrics Explorer**
2. Select metric type `logging/user/<metric_name>` such as `logging/user/live_session_started_count`
3. Keep the resource type on `cloud_run_revision`
4. Filter `resource.label.service_name` to the Terraform-managed API service if the page isn't already scoped
5. Optionally group by `metric.label.environment`, `metric.label.platform`, `metric.label.model`, or `metric.label.app_version`

You can also inspect the exact metric types and alert policy resource names through:

```bash
terraform -chdir=infra/terraform/envs/dev output api_telemetry_metric_types
terraform -chdir=infra/terraform/envs/dev output api_telemetry_alert_policy_names
terraform -chdir=infra/terraform/envs/dev output api_monitoring
```

### Initial dashboard layout

This repo intentionally does **not** provision a Cloud Monitoring dashboard in Terraform for this MVP. The dashboard JSON is possible, but it would add more IaC bulk than the current demo-focused scope warrants.

Create one small manual dashboard in Cloud Monitoring with these widgets:

- **Sessions per minute**: chart `live_session_started_count` as a rate or summed count per minute
- **Error rate**: chart `live_session_error_count` beside `live_session_started_count`, or create a ratio chart in Metrics Explorer if you want a quick error-rate view
- **Resume rate**: chart `live_session_resume_count` per minute
- **Session duration**: show average and p95 for `live_session_duration_ms`
- **Connect latency**: show average and p95 for `live_connect_latency_ms`
- **First response latency**: show average and p95 for `live_first_response_latency_ms`
- **Tokens per hour**: chart summed `live_session_total_tokens`
- **Tokens by model**: duplicate the tokens chart and group by `metric.label.model`

That layout gives the MVP questions you want answered during a demo: "Are sessions starting?", "Are errors spiking?", "Is resume happening?", "Is connection/response latency healthy?", and "How expensive are sessions getting?"

### Notification channels

This repo intentionally does **not** create email, SMS, PagerDuty, Slack, or webhook notification channels in Terraform. Those targets are team-specific and often contain personal or environment-sensitive routing details, so the lower-risk choice is:

1. create the notification channel manually in Cloud Monitoring (or reuse one your team already manages elsewhere)
2. copy its full resource name in the form `projects/PROJECT_ID/notificationChannels/CHANNEL_ID`
3. add that value to `monitoring.notification_channel_names` in `infra/terraform/envs/dev/terraform.tfvars`
4. run `terraform apply` so the alert policy attachment stays managed in code

If `notification_channel_names` is left empty, Terraform still creates the alert policy and incidents still appear in Cloud Monitoring, but no notification is delivered until channels are attached later.

Example:

```hcl
monitoring = {
  health_check_path      = "/health"
  uptime_check_period    = "60s"
  timeout                = "10s"
  alert_failure_duration = "120s"
  telemetry_error_spike_alignment_period  = "300s"
  telemetry_error_spike_threshold         = 3
  telemetry_started_absence_duration      = "900s"
  telemetry_connect_latency_alignment_period = "300s"
  telemetry_connect_latency_threshold_ms     = 2500
  notification_channel_names = [
    "projects/YOUR_GCP_PROJECT_ID/notificationChannels/1234567890123456789",
  ]
}
```

## Bootstrap assumptions and deferred state work

This stack assumes the following already exist outside Terraform:

- the Google Cloud project
- billing enabled on that project
- a caller with permission to enable services and create the managed resources

Terraform state stays local on purpose so `terraform init` works without extra bootstrap.
Wave 6 keeps that choice: remote Terraform state is still deferred rather than introducing backend migration risk into the monitoring polish work.
Recommended post-wave improvement: create the GCS bucket out of band first and then add a standard `backend "gcs"` block to the environment root when the team is ready to manage state migration explicitly.

## Deploying the API service

### Ownership split

Terraform owns the infrastructure shape:

- Artifact Registry repository
- Cloud Run service definition
- runtime service account attachment
- non-secret env vars, Secret Manager-backed env vars, and Cloud SQL attachment
- scaling, ingress, and public/private access

Cloud Build owns the application rollout path in `cloudbuild.yaml`:

- build the API image from the repository root with `apps/api/Dockerfile`
- push it to the Terraform-managed Artifact Registry repository
- update the existing Cloud Run service to the new image

The Cloud Run module intentionally ignores image-only drift so later `terraform apply` runs do not roll back a successful deploy. Keep `api_service.image` in `terraform.tfvars` set to a valid bootstrap image in the same repository for first create or future re-create operations.

### Deploy variables

`cloudbuild.yaml` keeps the deploy interface small:

- project id: Cloud Build built-in `$PROJECT_ID`
- region: `_REGION`
- Artifact Registry repository: `_AR_REPOSITORY`
- image name: `_IMAGE_NAME`
- image tag: `_IMAGE_TAG`
- Cloud Run service: `_SERVICE_NAME`

Recommended trigger defaults:

- `_REGION` = `terraform output -raw region`
- `_AR_REPOSITORY` = the `id` field from `terraform output -json artifact_registry`
- `_IMAGE_NAME` = `api`
- `_IMAGE_TAG` = `$SHORT_SHA`
- `_SERVICE_NAME` = `terraform output -raw api_cloud_run_service_name`

Same-project deployment is the intended Wave 5 path. `cloudbuild.yaml` uses Cloud Build's built-in `$PROJECT_ID`, so the trigger should run in the same Google Cloud project that Terraform manages unless you later add an explicit cross-project setup.

Example:

```hcl
api_service = {
  image = "us-central1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/livepair-dev-containers/api:bootstrap"
}
```

Cloud Run injects `PORT` automatically and the current API container already binds to that injected port.
The service remains stateless and continues logging to stdout/stderr.

### Secret Manager wiring

The Cloud Run service reads these environment variables from Secret Manager:

- `GEMINI_API_KEY`
- `SESSION_TOKEN_AUTH_SECRET`
- `DATABASE_URL`

Terraform in this wave creates only the secret containers plus accessor IAM.
You must add secret versions before the first deploy that creates or updates the Cloud Run service.
By default the service references the `latest` version of each secret, but you can pin versions through `api_secret_versions`.

Example manual population commands:

```bash
# These example secret names assume the default naming_prefix=livepair and environment_name=dev.
printf '%s' 'replace-with-real-gemini-key' | gcloud secrets versions add livepair-dev-gemini-api-key --data-file=-
printf '%s' 'replace-with-real-session-secret' | gcloud secrets versions add livepair-dev-session-token-auth-secret --data-file=-
printf '%s' 'postgres://livepair:APP_PASSWORD@/livepair?host=/cloudsql/PROJECT:REGION:INSTANCE' | gcloud secrets versions add livepair-dev-database-url --data-file=-
```

Construct the `DATABASE_URL` from the Cloud SQL outputs and the app user/password you chose in `terraform.tfvars`.
The Cloud Run module also mounts `/cloudsql` and attaches the Cloud SQL instance connection name so the Unix socket path is available to the container.

### First-time bootstrap

If Wave 4 has already created the Cloud Run service in your environment, you can skip this subsection and move straight to trigger setup.

If you are bootstrapping a fresh environment, there is one extra wrinkle: Terraform creates both the Artifact Registry repository and the Cloud Run service, but the Cloud Run service needs a valid image reference. The lowest-risk path is a one-time two-phase bootstrap:

1. Create the prerequisite infrastructure without the Cloud Run service yet:

```bash
terraform -chdir=infra/terraform/envs/dev apply -var-file=terraform.tfvars \
  -target=module.project_services \
  -target=module.artifact_registry \
  -target=module.service_accounts \
  -target=module.secret_manager \
  -target=module.cloud_sql
```

2. Push a bootstrap image from the repository root:

```bash
PROJECT_ID=your-gcp-project-id
REGION=us-central1
REPOSITORY=livepair-dev-containers
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:bootstrap"

gcloud auth configure-docker "${REGION}-docker.pkg.dev"
docker build -f apps/api/Dockerfile -t "${IMAGE_URI}" .
docker push "${IMAGE_URI}"
```

3. Populate the required Secret Manager versions.
4. Keep `api_service.image` in `terraform.tfvars` pointed at that bootstrap image.
5. Run the normal full apply:

```bash
terraform -chdir=infra/terraform/envs/dev apply -var-file=terraform.tfvars
```

Use the targeted apply only for this one-time bootstrap. Routine infrastructure changes should go back to normal `plan` / `apply`.

### Cloud Build trigger setup

Recommended console path:

1. Open **Cloud Build → Triggers → Create trigger** in the same project Terraform manages.
2. Connect the repository/branch you want to deploy from.
3. Choose **Configuration file (yaml/json)** and point it at `cloudbuild.yaml`.
4. Set substitutions for `_REGION`, `_AR_REPOSITORY`, `_IMAGE_NAME`, `_IMAGE_TAG`, and `_SERVICE_NAME`.
5. Prefer a dedicated build service account if your team already uses user-specified build identities; otherwise the project-default Cloud Build service account is acceptable for this same-project Wave 5 path.

The human or automation that creates/edits the trigger needs Cloud Build trigger-management permissions such as `roles/cloudbuild.builds.editor`, plus access to the connected source repository. If the trigger uses a user-specified build service account, that operator also needs permission to attach it.

If you prefer the CLI, use the provider-specific `gcloud builds triggers create ...` command for your repository connection type and pass the same `cloudbuild.yaml` path and substitutions above. The exact CLI syntax varies by source connection, so this repo keeps the checked-in build config stable and leaves the trigger resource itself out of scope.

Minimum IAM for the service account that executes the build:

- `roles/artifactregistry.writer` on the target repository or project so the build can push images
- `roles/run.admin` on the project so the build can deploy new Cloud Run revisions
- `roles/iam.serviceAccountUser` on the API runtime service account so the deploy can keep using Terraform's runtime identity

Additional caveats:

- If you use a user-specified build service account, make sure your build logging setup still works; `roles/logging.logWriter` is commonly required when logs go to Cloud Logging.
- Same-project defaults often cover Cloud Run image pulls automatically, but stricter repository IAM or any cross-project image path may require an explicit `roles/artifactregistry.reader` grant for the runtime pull identity.
- If `api_service.allow_unauthenticated = true`, Terraform grants `roles/run.invoker` to `allUsers`. That can fail under Domain Restricted Sharing or similar org-policy controls. In that case, keep the service private or extend the infrastructure later with the Cloud Run public-access mechanism your organization allows.

### Triggerless manual fallback

If the trigger is not set up yet, or if you want a reproducible manual deploy/debug path, submit the same build config directly:

```bash
PROJECT_ID=your-gcp-project-id
REGION=us-central1
REPOSITORY=livepair-dev-containers
SERVICE=livepair-dev-api

gcloud builds submit \
  --project "$PROJECT_ID" \
  --config cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_AR_REPOSITORY="$REPOSITORY",_IMAGE_NAME=api,_IMAGE_TAG="$(git rev-parse --short HEAD)",_SERVICE_NAME="$SERVICE" \
  .
```

That command reuses the checked-in pipeline and does not embed secrets into the image or the build config. The Cloud Run service continues to read `GEMINI_API_KEY`, `SESSION_TOKEN_AUTH_SECRET`, and `DATABASE_URL` from Secret Manager at runtime.

Keep these checks in mind before the first live deploy:

- populate all required Secret Manager versions
- confirm the `DATABASE_URL` secret uses the `/cloudsql/PROJECT:REGION:INSTANCE` host path form expected by Cloud Run socket connections
- decide whether `api_service.allow_unauthenticated` should stay `true` for dev
- verify the trigger substitutions still match Terraform outputs after any environment rename

After the first deploy path is working, normal infrastructure changes still go through:

```bash
terraform -chdir=infra/terraform/envs/dev plan -var-file=terraform.tfvars
terraform -chdir=infra/terraform/envs/dev apply -var-file=terraform.tfvars
```

Useful outputs after apply:

- `api_cloud_run_service_name`
- `api_cloud_run_service_url`
- `api_cloud_run`
- `api_uptime_check_name`
- `api_alert_policy_name`
- `api_telemetry_metric_types`
- `api_telemetry_alert_policy_names`
- `api_monitoring`
- `cloud_sql.instance_connection_name`
- `artifact_registry.url`

## Notes for later waves

This foundation intentionally stops short of:

- running migrations with a Cloud Run Job or any other execution flow
- populating Secret Manager versions
- rotating or pinning secrets through Terraform-managed secret-version resources
- reworking the backend application to use a different database config model
- provisioning the Cloud Build trigger itself through Terraform or another GitOps layer
- provisioning notification-channel targets directly in the repo
- migrating Terraform state to a remote GCS backend

The outputs from `envs/dev` expose the repository URL, service account emails, secret names, Cloud SQL connection identifiers, and Cloud Run service URL for those follow-up waves.
