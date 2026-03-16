output "instance_name" {
  description = "Cloud SQL instance name."
  value       = google_sql_database_instance.this.name
}

output "instance_connection_name" {
  description = "Cloud SQL connection name for later Cloud Run wiring."
  value       = google_sql_database_instance.this.connection_name
}

output "database_name" {
  description = "Primary application database name."
  value       = google_sql_database.application.name
}

output "app_user_name" {
  description = "Primary application database user name."
  value       = google_sql_user.application.name
}
