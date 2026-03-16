output "project_id" {
  description = "Google Cloud project ID for the dev environment."
  value       = var.project_id
}

output "region" {
  description = "Primary region for dev resources."
  value       = var.region
}

output "environment_name" {
  description = "Environment name used for naming and labels."
  value       = var.environment_name
}

output "enabled_services" {
  description = "Project services explicitly managed by Terraform."
  value       = module.project_services.enabled_services
}

output "artifact_registry" {
  description = "Artifact Registry repository details for later image push/deploy waves."
  value = {
    id       = module.artifact_registry.repository_id
    name     = module.artifact_registry.repository_name
    location = module.artifact_registry.repository_location
    url      = module.artifact_registry.repository_url
  }
}

output "service_accounts" {
  description = "Service accounts reserved for later backend runtime and migration flows."
  value       = module.service_accounts.service_accounts
}

output "secret_ids" {
  description = "Secret Manager secret IDs keyed by logical name."
  value       = module.secret_manager.secret_ids
}

output "secret_names" {
  description = "Fully qualified Secret Manager secret resource names keyed by logical name."
  value       = module.secret_manager.secret_names
}

output "cloud_sql" {
  description = "Cloud SQL identifiers needed by later deployment and secret-population work."
  value = {
    instance_name             = module.cloud_sql.instance_name
    instance_connection_name  = module.cloud_sql.instance_connection_name
    database_name             = module.cloud_sql.database_name
    app_user_name             = module.cloud_sql.app_user_name
  }
}

output "api_cloud_run_service_name" {
  description = "Cloud Run service name for the API."
  value       = module.cloud_run.service_name
}

output "api_cloud_run_service_url" {
  description = "Public URL for the API Cloud Run service."
  value       = module.cloud_run.service_url
}

output "api_cloud_run" {
  description = "Cloud Run deployment metadata for the API service."
  value = {
    service_name                       = module.cloud_run.service_name
    service_url                        = module.cloud_run.service_url
    image                              = var.api_service.image
    service_account_email              = module.service_accounts.service_account_emails["api_runtime"]
    allow_unauthenticated              = var.api_service.allow_unauthenticated
    cloud_sql_instance_connection_name = module.cloud_sql.instance_connection_name
  }
}
