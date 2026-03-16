output "enabled_services" {
  description = "APIs managed by this module."
  value       = sort([for service in google_project_service.this : service.service])
}
