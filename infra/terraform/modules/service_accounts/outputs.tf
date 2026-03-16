output "service_account_emails" {
  description = "Service account emails keyed by logical name."
  value       = { for key, sa in google_service_account.this : key => sa.email }
}

output "service_account_names" {
  description = "Service account resource names keyed by logical name."
  value       = { for key, sa in google_service_account.this : key => sa.name }
}

output "service_accounts" {
  description = "Structured service account metadata keyed by logical name."
  value = {
    for key, sa in google_service_account.this : key => {
      email     = sa.email
      name      = sa.name
      unique_id = sa.unique_id
    }
  }
}
