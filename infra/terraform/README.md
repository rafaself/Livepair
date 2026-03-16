# Terraform base infrastructure

Wave 4 extends the Terraform foundation for Google Cloud under `infra/terraform`.
The scope is still intentionally narrow:

- enable the required Google APIs
- create a regional Artifact Registry repository
- create user-managed service accounts for future runtime and migration flows
- grant narrow IAM needed for those service accounts today
- create Secret Manager secret containers only
- create a Cloud SQL PostgreSQL instance, database, and application user
- deploy the API baseline onto Cloud Run from a configurable image reference
- wire non-secret runtime config, Secret Manager-backed env vars, and Cloud SQL attachment for the API service

This wave does **not** add Cloud Build, migration jobs, secret values, or production rollout automation.

## Layout

```text
infra/terraform/
├── envs/
│   └── dev/
└── modules/
    ├── artifact_registry/
    ├── cloud_sql/
    ├── cloud_run/
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

- required project services: Artifact Registry, IAM, Cloud Run, Secret Manager, Service Usage, and Cloud SQL Admin
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

For the current dev foundation, the example settings keep Cloud SQL on public IPv4 and leave backups disabled so the environment stays inexpensive and does not pull VPC/private-service networking into scope.
Revisit those two knobs before any broader rollout.

## Bootstrap assumptions and deferred state work

This stack assumes the following already exist outside Terraform:

- the Google Cloud project
- billing enabled on that project
- a caller with permission to enable services and create the managed resources

Terraform state stays local on purpose so `terraform init` works without extra bootstrap.
If you later want remote state, create the GCS bucket out of band first and then add a backend block to the environment root.
That remote-state bootstrap is intentionally deferred so this wave stays reviewable and does not depend on one Terraform stack creating its own backend.

## Deploying the API service

`api_service.image` is required and must point at an image that already exists.
Terraform does **not** build or push the image in this wave.

Example:

```hcl
api_service = {
  image = "us-central1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/livepair-dev-containers/api:manual"
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

### First deployment checklist

Before the first `apply` that includes Cloud Run:

- build and push the API image to the Artifact Registry repository URL output by Terraform
- populate all required Secret Manager versions
- confirm the `DATABASE_URL` secret uses the `/cloudsql/PROJECT:REGION:INSTANCE` host path form expected by Cloud Run socket connections
- decide whether `api_service.allow_unauthenticated` should stay `true` for dev

After that:

```bash
terraform -chdir=infra/terraform/envs/dev plan -var-file=terraform.tfvars
terraform -chdir=infra/terraform/envs/dev apply -var-file=terraform.tfvars
```

Useful outputs after apply:

- `api_cloud_run_service_name`
- `api_cloud_run_service_url`
- `api_cloud_run`
- `cloud_sql.instance_connection_name`
- `artifact_registry.url`

## Notes for later waves

This foundation intentionally stops short of:

- pushing images or configuring Cloud Build
- running migrations with a Cloud Run Job or any other execution flow
- populating Secret Manager versions
- rotating or pinning secrets through Terraform-managed secret-version resources
- reworking the backend application to use a different database config model

The outputs from `envs/dev` expose the repository URL, service account emails, secret names, Cloud SQL connection identifiers, and Cloud Run service URL for those follow-up waves.
