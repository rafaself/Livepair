output "repository_id" {
  description = "Artifact Registry repository ID."
  value       = google_artifact_registry_repository.this.repository_id
}

output "repository_name" {
  description = "Fully qualified Artifact Registry repository resource name."
  value       = google_artifact_registry_repository.this.name
}

output "repository_location" {
  description = "Artifact Registry repository region."
  value       = google_artifact_registry_repository.this.location
}

output "repository_url" {
  description = "Docker repository base URL for future image pushes."
  value       = format("%s-docker.pkg.dev/%s/%s", var.location, var.project_id, google_artifact_registry_repository.this.repository_id)
}
