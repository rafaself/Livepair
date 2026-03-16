output "service_name" {
  description = "Cloud Run service name."
  value       = google_cloud_run_v2_service.this.name
}

output "service_id" {
  description = "Fully qualified Cloud Run service resource ID."
  value       = google_cloud_run_v2_service.this.id
}

output "service_url" {
  description = "Primary HTTPS URL for the Cloud Run service."
  value       = google_cloud_run_v2_service.this.uri
}

output "latest_ready_revision" {
  description = "Latest ready revision name reported by Cloud Run."
  value       = google_cloud_run_v2_service.this.latest_ready_revision
}
