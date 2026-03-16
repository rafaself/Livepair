output "monitored_url" {
  description = "Base public URL monitored by the uptime check."
  value       = var.target_url
}

output "monitored_path" {
  description = "HTTP path monitored by the uptime check."
  value       = local.monitored_path
}

output "monitored_host" {
  description = "Host portion of the monitored URL."
  value       = local.monitored_host
}

output "uptime_check_id" {
  description = "Cloud Monitoring uptime check ID."
  value       = google_monitoring_uptime_check_config.api_health.uptime_check_id
}

output "uptime_check_name" {
  description = "Fully qualified Cloud Monitoring uptime check resource name."
  value       = google_monitoring_uptime_check_config.api_health.name
}

output "uptime_check_display_name" {
  description = "Display name of the uptime check."
  value       = google_monitoring_uptime_check_config.api_health.display_name
}

output "alert_policy_name" {
  description = "Fully qualified Cloud Monitoring alert policy resource name."
  value       = google_monitoring_alert_policy.api_health_failed.name
}

output "alert_policy_display_name" {
  description = "Display name of the alert policy."
  value       = google_monitoring_alert_policy.api_health_failed.display_name
}

output "notification_channel_names" {
  description = "Notification channel resource names attached to the alert policy."
  value       = var.notification_channel_names
}

output "telemetry_log_filter" {
  description = "Base Cloud Logging filter used to scope Gemini Live telemetry metrics to the API Cloud Run service."
  value       = local.telemetry_log_filter
}

output "telemetry_metric_types" {
  description = "Gemini Live telemetry log-based metric types keyed by metric name."
  value       = local.telemetry_metric_types
}

output "telemetry_alert_policy_names" {
  description = "Gemini Live telemetry alert policy resource names keyed by purpose."
  value = {
    error_spike          = google_monitoring_alert_policy.live_session_error_spike.name
    started_absent       = google_monitoring_alert_policy.live_session_started_absent.name
    connect_latency_high = google_monitoring_alert_policy.live_connect_latency_high.name
  }
}
