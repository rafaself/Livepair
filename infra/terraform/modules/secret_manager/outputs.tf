output "secret_ids" {
  description = "Secret IDs keyed by logical name."
  value       = { for key, secret in google_secret_manager_secret.this : key => secret.secret_id }
}

output "secret_names" {
  description = "Fully qualified secret resource names keyed by logical name."
  value       = { for key, secret in google_secret_manager_secret.this : key => secret.name }
}
