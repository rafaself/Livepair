output "job_name" {
  description = "Cloud Run job name."
  value       = google_cloud_run_v2_job.this.name
}

output "job_id" {
  description = "Fully qualified Cloud Run job resource ID."
  value       = google_cloud_run_v2_job.this.id
}
