# Terraform base infrastructure

Wave 3 adds the first Terraform foundation for Google Cloud under `infra/terraform`.
The scope is intentionally narrow:

- enable the required Google APIs
- create a regional Artifact Registry repository
- create user-managed service accounts for future runtime and migration flows
- grant narrow IAM needed for those service accounts today
- create Secret Manager secret containers only
- create a Cloud SQL PostgreSQL instance, database, and application user

This wave does **not** add Cloud Build, Cloud Run services, migration jobs, secret values, or production rollout automation.

## Layout

```text
infra/terraform/
├── envs/
│   └── dev/
└── modules/
    ├── artifact_registry/
    ├── cloud_sql/
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

The `dev` root currently manages:

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

For the initial Wave 3 foundation, the example `dev` settings keep Cloud SQL on public IPv4 and leave backups disabled so the environment stays inexpensive and does not pull VPC/private-service networking into scope.
Revisit those two knobs before any broader rollout.

## Bootstrap assumptions and deferred state work

This stack assumes the following already exist outside Terraform:

- the Google Cloud project
- billing enabled on that project
- a caller with permission to enable services and create the managed resources

Wave 3 keeps Terraform state local on purpose so `terraform init` works without extra bootstrap.
If you later want remote state, create the GCS bucket out of band first and then add a backend block to the environment root.
That remote-state bootstrap is intentionally deferred so this wave stays reviewable and does not depend on one Terraform stack creating its own backend.

## Notes for later waves

This foundation intentionally stops short of:

- pushing images or configuring Cloud Build
- deploying Cloud Run services or jobs
- populating Secret Manager versions
- constructing the final runtime `DATABASE_URL`
- wiring the backend app to Cloud SQL or cloud-provided secrets

The outputs from `envs/dev` expose the repository URL, service account emails, secret names, and Cloud SQL connection identifiers for those follow-up waves.
