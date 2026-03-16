# Terraform base infrastructure

Wave 4 lays the Terraform foundation for Google Cloud under `infra/terraform`, Wave 5 adds the operational handoff to Cloud Build for API image rollouts, and Wave 6 hardens that path into a staging-first CD flow.
The scope is still intentionally narrow:

- enable the required Google APIs
- create a regional Artifact Registry repository
- create user-managed service accounts for runtime and migration flows
- grant narrow IAM needed for those service accounts today
- create Secret Manager secret containers only
- create a Cloud SQL PostgreSQL instance, database, and application user
- deploy the API baseline onto Cloud Run from a configurable bootstrap image reference
- create a Cloud Run Job for API database migrations from a configurable bootstrap image reference
- wire non-secret runtime config, Secret Manager-backed env vars, and Cloud SQL attachment for the API service
- add a public Cloud Monitoring uptime check against the deployed API `/health` endpoint
- add a minimal alerting policy for uptime-check failures
- create Gemini Live telemetry log-based metrics from the API's structured Cloud Run logs
- add a small set of metric-based alert policies on top of those telemetry metrics
- check in a Cloud Build pipeline that builds, pushes, migrates, deploys, and smoke-tests the API rollout
- check in GitHub Actions entry points for automatic staging deploys and controlled production deploys

This repo still does **not** create the Cloud Build trigger itself, populate secret values, rotate secrets through Terraform-managed versions, or provision GitHub-to-Google authentication.

## Layout

```text
infra/terraform/
├── envs/
│   ├── dev/
│   ├── production/
│   └── staging/
└── modules/
    ├── artifact_registry/
    ├── cloud_sql/
    ├── cloud_run/
    ├── cloud_run_job/
    ├── monitoring/
    ├── project_services/
    ├── secret_manager/
    └── service_accounts/
```

Use `envs/staging` and `envs/production` for the CD path. `envs/dev` remains available for lower-risk experimentation and bootstrap work.

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

Create a local `terraform.tfvars` file from the example in the environment root you are working on:

```bash
cp infra/terraform/envs/staging/terraform.tfvars.example infra/terraform/envs/staging/terraform.tfvars
```

Required inputs stay intentionally small:

- `project_id`
- `region`
- `environment_name`
- `naming_prefix`
- `database` settings, including sizing, backup/public-IP toggles, and the app user password
- `api_service` settings, including the container image reference and Cloud Run sizing
- `api_migration_job` settings, including the migration image reference and Cloud Run Job sizing
- optional `api_runtime` overrides for non-secret API env vars
- optional `api_secret_versions` pins if you do not want to use `latest`
- optional `monitoring` overrides for the uptime-check path, cadence, telemetry alert thresholds, and notification channel resource names

Do **not** commit `terraform.tfvars` or any real secret values.
The committed example file keeps `app_user_password` as a placeholder so `plan` remains reviewable.

## Usage

From the repository root:

```bash
terraform -chdir=infra/terraform/envs/staging init
terraform -chdir=infra/terraform/envs/staging validate
terraform -chdir=infra/terraform/envs/staging plan -var-file=terraform.tfvars
```

Optional formatting:

```bash
terraform fmt -recursive infra/terraform
```

Apply only after reviewing the plan carefully:

```bash
terraform -chdir=infra/terraform/envs/staging apply -var-file=terraform.tfvars
```

## Managed resources

Each environment root now manages:

- required project services: Artifact Registry, Cloud Build, IAM, Cloud Logging, Cloud Monitoring, Cloud Run, Secret Manager, Service Usage, and Cloud SQL Admin
- one regional Docker Artifact Registry repository
- two user-managed service accounts: API runtime and API migrator
- project-level IAM for `roles/cloudsql.client`
- secret-level IAM for `roles/secretmanager.secretAccessor`
- three secret containers reserved for later population:
  - `GEMINI_API_KEY`
  - `SESSION_TOKEN_AUTH_SECRET`
  - `DATABASE_URL`
- one PostgreSQL Cloud SQL instance, one application database, and one application user
- one Cloud Run v2 service for the API, attached to the API runtime service account
- one Cloud Run v2 job for API database migrations, attached to the API migrator service account
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

Terraform owns the environment shape:

- Artifact Registry repository
- Cloud Run service definition
- Cloud Run migration job definition
- runtime and migrator service account attachment
- non-secret env vars, Secret Manager-backed env vars, and Cloud SQL attachment
- scaling, ingress, public/private access, and monitoring

Cloud Build owns the ordered rollout in `cloudbuild.yaml`:

1. build the API image from `apps/api/Dockerfile`
2. build the compatible migration image from the same Dockerfile `migrator` target
3. push both images with the commit SHA tag
4. update the existing Cloud Run migration job to that migration image
5. execute the migration job and wait for completion
6. deploy the existing Cloud Run service to the API image
7. smoke-test the deployed `/health` endpoint

GitHub Actions owns the environment entry points:

- `.github/workflows/deploy-staging.yml` automatically deploys `main` to the `staging` GitHub environment
- `.github/workflows/deploy-production.yml` performs a controlled manual deploy to the `production` GitHub environment from a specified Git ref that already passed staging

Both the Cloud Run service module and the Cloud Run Job module intentionally ignore image-only drift so later `terraform apply` runs do not roll back a successful deploy. Keep `api_service.image` and `api_migration_job.image` in `terraform.tfvars` set to valid bootstrap images in the same repository for first create or future re-create operations.

### Deploy variables

`cloudbuild.yaml` keeps the deploy interface explicit:

- project id: Cloud Build built-in `$PROJECT_ID`
- region: `_REGION`
- Artifact Registry repository: `_AR_REPOSITORY`
- API image name: `_IMAGE_NAME`
- migration image name: `_MIGRATION_IMAGE_NAME`
- immutable image tag: `_IMAGE_TAG`
- Cloud Run service: `_SERVICE_NAME`
- Cloud Run migration job: `_MIGRATION_JOB_NAME`
- smoke path: `_SMOKE_PATH`

Recommended values per environment:

- `_REGION` = `terraform output -raw region`
- `_AR_REPOSITORY` = the `id` field from `terraform output -json artifact_registry`
- `_IMAGE_NAME` = `api`
- `_MIGRATION_IMAGE_NAME` = `api-migrator`
- `_IMAGE_TAG` = full Git commit SHA
- `_SERVICE_NAME` = `terraform output -raw api_cloud_run_service_name`
- `_MIGRATION_JOB_NAME` = `terraform output -raw api_migration_job_name`
- `_SMOKE_PATH` = `/health`

Same-project deployment is the intended path. `cloudbuild.yaml` uses Cloud Build's built-in `$PROJECT_ID`, so the build should run in the same Google Cloud project that Terraform manages unless you later add an explicit cross-project setup.

Cloud Run injects `PORT` automatically and the current API container already binds to that injected port. The service remains stateless and continues logging to stdout/stderr.

### Secret Manager wiring

The Cloud Run service reads these environment variables from Secret Manager:

- `GEMINI_API_KEY`
- `SESSION_TOKEN_AUTH_SECRET`
- `DATABASE_URL`

The Cloud Run migration job reads:

- `DATABASE_URL`

Terraform creates the secret containers plus accessor IAM, but you must add secret versions before the first deploy that creates or updates either resource. By default both service and job reference the `latest` version of each secret, but you can pin versions through `api_secret_versions`.

Example manual population commands:

```bash
# These example secret names assume the default naming_prefix=livepair and environment_name=staging.
printf '%s' 'replace-with-real-gemini-key' | gcloud secrets versions add livepair-staging-gemini-api-key --data-file=-
printf '%s' 'replace-with-real-session-secret' | gcloud secrets versions add livepair-staging-session-token-auth-secret --data-file=-
printf '%s' 'postgres://livepair:APP_PASSWORD@/livepair?host=/cloudsql/PROJECT:REGION:INSTANCE' | gcloud secrets versions add livepair-staging-database-url --data-file=-
```

Construct the `DATABASE_URL` from the Cloud SQL outputs and the app user/password you chose in `terraform.tfvars`. Both the service and migration job mount `/cloudsql` and attach the Cloud SQL instance connection name so the Unix socket path is available to the container.

### First-time bootstrap

If Terraform has already created the Cloud Run service and migration job in your environment, you can skip this subsection and move straight to workflow setup.

If you are bootstrapping a fresh environment, there is one extra wrinkle: Terraform creates the Artifact Registry repository, Cloud Run service, and Cloud Run Job, but both Cloud Run resources need valid image references. The lowest-risk path is a one-time two-phase bootstrap:

1. Create the prerequisite infrastructure without the Cloud Run resources yet:

```bash
terraform -chdir=infra/terraform/envs/staging apply -var-file=terraform.tfvars \
  -target=module.project_services \
  -target=module.artifact_registry \
  -target=module.service_accounts \
  -target=module.secret_manager \
  -target=module.cloud_sql
```

2. Push bootstrap images from the repository root:

```bash
PROJECT_ID=your-gcp-project-id
REGION=us-central1
REPOSITORY=livepair-staging-containers
API_IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:bootstrap"
MIGRATION_IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api-migrator:bootstrap"

gcloud auth configure-docker "${REGION}-docker.pkg.dev"
docker build -f apps/api/Dockerfile -t "${API_IMAGE_URI}" .
docker build --target migrator -f apps/api/Dockerfile -t "${MIGRATION_IMAGE_URI}" .
docker push "${API_IMAGE_URI}"
docker push "${MIGRATION_IMAGE_URI}"
```

3. Populate the required Secret Manager versions.
4. Keep `api_service.image` and `api_migration_job.image` in `terraform.tfvars` pointed at those bootstrap images.
5. Run the normal full apply:

```bash
terraform -chdir=infra/terraform/envs/staging apply -var-file=terraform.tfvars
```

Use the targeted apply only for this one-time bootstrap. Routine infrastructure changes should go back to normal `plan` / `apply`.

### GitHub Actions environment setup

The checked-in CD workflows use GitHub environments named `staging` and `production`. Configure these per-environment variables before you enable the workflows:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_ARTIFACT_REPOSITORY`
- `GCP_API_IMAGE_NAME` (`api`)
- `GCP_API_MIGRATION_IMAGE_NAME` (`api-migrator`)
- `GCP_API_SERVICE_NAME`
- `GCP_API_MIGRATION_JOB_NAME`
- `GCP_SMOKE_PATH` (`/health`)
- `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` when you use Workload Identity Federation
- `GCP_CREDENTIALS_JSON` secret when you use a service account key JSON instead

Configure exactly one auth mode per GitHub environment:

- Workload Identity Federation: set `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT`
- Service account key fallback: set the `GCP_CREDENTIALS_JSON` secret

If neither mode is configured, the workflow now fails in a preflight step with a direct setup message before calling `google-github-actions/auth`.

### IAM for deploy automation

Minimum IAM for the identity that executes Cloud Build:

- `roles/artifactregistry.writer` on the target repository or project so the build can push images
- `roles/run.admin` on the project so the build can update the migration job and deploy new Cloud Run revisions
- `roles/iam.serviceAccountUser` on the API runtime service account so the service deploy keeps using Terraform's runtime identity
- `roles/iam.serviceAccountUser` on the API migrator service account so the migration job update keeps using Terraform's job identity

Minimum IAM for the identity used by GitHub Actions to submit the build:

- `roles/cloudbuild.builds.editor` on the target project
- `roles/serviceusage.serviceUsageConsumer` on the target project so `gcloud builds submit` can use the Cloud Build API
- access to the Cloud Build source-staging bucket used by `gcloud builds submit .`
  - if you rely on the default legacy bucket, grant `roles/storage.objectAdmin` on `gs://<project-id>_cloudbuild`
  - if you create that bucket manually, also grant the Cloud Build runtime identities `roles/storage.objectViewer` on it (`<project-number>@cloudbuild.gserviceaccount.com` and `service-<project-number>@gcp-sa-cloudbuild.iam.gserviceaccount.com`)
- any additional permissions required by your chosen GitHub-to-Google authentication setup

Additional caveats:

- If you use a user-specified Cloud Build service account, make sure your build logging setup still works; `roles/logging.logWriter` is commonly required when logs go to Cloud Logging.
- Same-project defaults often cover Cloud Run image pulls automatically, but stricter repository IAM or any cross-project image path may require an explicit `roles/artifactregistry.reader` grant for the runtime pull identity.
- If `api_service.allow_unauthenticated = true`, Terraform grants `roles/run.invoker` to `allUsers`. That can fail under Domain Restricted Sharing or similar org-policy controls. In that case, keep the service private or extend the infrastructure later with the Cloud Run public-access mechanism your organization allows.

### Manual deploy and migration fallback

If GitHub Actions is not set up yet, or if you want a reproducible manual deploy/debug path, submit the same build config directly:

```bash
PROJECT_ID=your-gcp-project-id
REGION=us-central1
REPOSITORY=livepair-staging-containers
SERVICE=livepair-staging-api
MIGRATION_JOB=livepair-staging-api-migrate
IMAGE_TAG="$(git rev-parse HEAD)"

gcloud builds submit \
  --project "$PROJECT_ID" \
  --config cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_AR_REPOSITORY="$REPOSITORY",_IMAGE_NAME=api,_MIGRATION_IMAGE_NAME=api-migrator,_IMAGE_TAG="$IMAGE_TAG",_SERVICE_NAME="$SERVICE",_MIGRATION_JOB_NAME="$MIGRATION_JOB",_SMOKE_PATH=/health \
  .
```

If you only need to rerun migrations manually with a specific image SHA:

```bash
PROJECT_ID=your-gcp-project-id
REGION=us-central1
REPOSITORY=livepair-staging-containers
MIGRATION_JOB=livepair-staging-api-migrate
IMAGE_TAG=replace-with-known-sha

gcloud run jobs update "$MIGRATION_JOB" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api-migrator:${IMAGE_TAG}"

gcloud run jobs execute "$MIGRATION_JOB" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --wait
```

Both commands reuse the checked-in pipeline/job definition and do not embed secrets into the image or the build config.

### Rollback

For an application rollback, do **not** rebuild a new image. Use either the previous Cloud Run revision or a previously pushed SHA-tagged image.

Revision-based rollback:

```bash
gcloud run revisions list \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --service "$SERVICE"

gcloud run services update-traffic "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --to-revisions REVISION_NAME=100
```

Image-based rollback:

```bash
KNOWN_GOOD_SHA=replace-with-known-sha

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform=managed \
  --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/api:${KNOWN_GOOD_SHA}" \
  --quiet
```

After either rollback path, rerun the smoke check:

```bash
SERVICE_URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
curl --fail --silent --show-error "${SERVICE_URL}/health"
```

If a failed deployment already ran a forward-only schema migration that is not backward-compatible, application rollback alone may not be sufficient. In that case, pause traffic changes and use your database restore procedure outside this repo. The happy-path expectation for this CD pipeline is additive or backward-compatible migrations so that a service rollback remains viable.

### Useful outputs after apply

- `artifact_registry`
- `cloud_sql`
- `api_cloud_run_service_name`
- `api_cloud_run_service_url`
- `api_cloud_run`
- `api_migration_job_name`
- `api_migration_job`
- `api_uptime_check_name`
- `api_alert_policy_name`
- `api_telemetry_metric_types`
- `api_telemetry_alert_policy_names`
- `api_monitoring`

## Notes for later waves

This foundation intentionally stops short of:

- provisioning Cloud Build triggers themselves through Terraform or another GitOps layer
- provisioning GitHub Workload Identity resources
- populating or rotating Secret Manager versions through Terraform-managed secret-version resources
- reworking the backend application to use a different database config model
- provisioning notification-channel targets directly in the repo
- migrating Terraform state to a remote GCS backend

The environment outputs expose the repository URL, service account emails, secret names, Cloud SQL connection identifiers, Cloud Run service URL, and Cloud Run migration job name for those follow-up steps.
