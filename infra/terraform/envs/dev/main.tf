provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  base_name = "${var.naming_prefix}-${var.environment_name}"

  common_labels = {
    application = var.naming_prefix
    environment = var.environment_name
    managed_by  = "terraform"
  }

  required_services = toset([
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "sqladmin.googleapis.com",
  ])

  service_account_configs = {
    api_runtime = {
      account_id    = "${local.base_name}-api"
      display_name  = "Livepair ${upper(var.environment_name)} API runtime"
      description   = "Runtime identity for the Livepair backend service."
      project_roles = ["roles/cloudsql.client"]
    }
    api_migrator = {
      account_id    = "${local.base_name}-migrator"
      display_name  = "Livepair ${upper(var.environment_name)} DB migrator"
      description   = "Reserved identity for a future migration execution job."
      project_roles = ["roles/cloudsql.client"]
    }
  }
}

module "project_services" {
  source = "../../modules/project_services"

  project_id = var.project_id
  services   = local.required_services
}

module "artifact_registry" {
  source = "../../modules/artifact_registry"

  project_id    = var.project_id
  location      = var.region
  repository_id = "${local.base_name}-containers"
  description   = "Container images for the Livepair ${var.environment_name} environment."
  labels        = local.common_labels

  depends_on = [module.project_services]
}

module "service_accounts" {
  source = "../../modules/service_accounts"

  project_id        = var.project_id
  service_accounts  = local.service_account_configs

  depends_on = [module.project_services]
}

module "secret_manager" {
  source = "../../modules/secret_manager"

  project_id = var.project_id
  labels     = local.common_labels
  secrets = {
    gemini_api_key = {
      secret_id = "${local.base_name}-gemini-api-key"
      labels    = { purpose = "api-config" }
      accessors = [module.service_accounts.service_account_emails["api_runtime"]]
    }
    session_token_auth_secret = {
      secret_id = "${local.base_name}-session-token-auth-secret"
      labels    = { purpose = "api-config" }
      accessors = [module.service_accounts.service_account_emails["api_runtime"]]
    }
    database_url = {
      secret_id = "${local.base_name}-database-url"
      labels    = { purpose = "database" }
      accessors = [
        module.service_accounts.service_account_emails["api_runtime"],
        module.service_accounts.service_account_emails["api_migrator"],
      ]
    }
  }

  depends_on = [module.project_services, module.service_accounts]
}

module "cloud_sql" {
  source = "../../modules/cloud_sql"

  project_id          = var.project_id
  region              = var.region
  instance_name       = "${local.base_name}-pg"
  database_version    = var.database.version
  tier                = var.database.tier
  availability_type   = var.database.availability_type
  disk_size_gb        = var.database.disk_size_gb
  disk_type           = var.database.disk_type
  backup_enabled      = var.database.backup_enabled
  ipv4_enabled        = var.database.ipv4_enabled
  deletion_protection = var.database.deletion_protection
  database_name       = var.database.database_name
  app_user_name       = var.database.app_user_name
  app_user_password   = var.database.app_user_password
  labels              = local.common_labels

  depends_on = [module.project_services]
}
