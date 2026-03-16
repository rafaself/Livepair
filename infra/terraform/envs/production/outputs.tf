output "project_id" {
  description = "Google Cloud project ID for the dev environment."
  value       = var.project_id
}

output "region" {
  description = "Primary region for the current environment."
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
  description = "Service accounts reserved for backend runtime and migration flows."
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
    instance_name            = module.cloud_sql.instance_name
    instance_connection_name = module.cloud_sql.instance_connection_name
    database_name            = module.cloud_sql.database_name
    app_user_name            = module.cloud_sql.app_user_name
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
  description = "Cloud Run deployment metadata for the API service, including the Terraform bootstrap image reference."
  value = {
    service_name                       = module.cloud_run.service_name
    service_url                        = module.cloud_run.service_url
    bootstrap_image                    = var.api_service.image
    service_account_email              = module.service_accounts.service_account_emails["api_runtime"]
    allow_unauthenticated              = var.api_service.allow_unauthenticated
    cloud_sql_instance_connection_name = module.cloud_sql.instance_connection_name
  }
}

output "api_migration_job_name" {
  description = "Cloud Run job name for API database migrations."
  value       = module.cloud_run_job.job_name
}

output "api_migration_job" {
  description = "Cloud Run migration job metadata for the API."
  value = {
    job_name        = module.cloud_run_job.job_name
    bootstrap_image = var.api_migration_job.image
    service_account = module.service_accounts.service_account_emails["api_migrator"]
    database_secret = module.secret_manager.secret_ids["database_url"]
    task_count      = var.api_migration_job.task_count
    parallelism     = var.api_migration_job.parallelism
    timeout         = var.api_migration_job.timeout
  }
}

output "api_uptime_check_name" {
  description = "Fully qualified Cloud Monitoring uptime check resource name for the public API."
  value       = module.monitoring.uptime_check_name
}

output "api_alert_policy_name" {
  description = "Fully qualified Cloud Monitoring alert policy resource name for the public API."
  value       = module.monitoring.alert_policy_name
}

output "api_telemetry_metric_types" {
  description = "Gemini Live telemetry log-based metric types keyed by metric name."
  value       = module.monitoring.telemetry_metric_types
}

output "api_telemetry_alert_policy_names" {
  description = "Gemini Live telemetry alert policy resource names keyed by purpose."
  value       = module.monitoring.telemetry_alert_policy_names
}

output "api_monitoring" {
  description = "Cloud Monitoring metadata for the public API uptime check plus Gemini Live telemetry metrics and alerts."
  value = {
    monitored_url                = module.monitoring.monitored_url
    monitored_host               = module.monitoring.monitored_host
    monitored_path               = module.monitoring.monitored_path
    uptime_check_id              = module.monitoring.uptime_check_id
    uptime_check_name            = module.monitoring.uptime_check_name
    uptime_check_display_name    = module.monitoring.uptime_check_display_name
    alert_policy_name            = module.monitoring.alert_policy_name
    alert_policy_display_name    = module.monitoring.alert_policy_display_name
    notification_channel_names   = module.monitoring.notification_channel_names
    notification_setup_required  = length(module.monitoring.notification_channel_names) == 0
    telemetry_log_filter         = module.monitoring.telemetry_log_filter
    telemetry_metric_types       = module.monitoring.telemetry_metric_types
    telemetry_alert_policy_names = module.monitoring.telemetry_alert_policy_names
  }
}
