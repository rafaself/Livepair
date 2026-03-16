resource "google_sql_database_instance" "this" {
  project          = var.project_id
  name             = var.instance_name
  region           = var.region
  database_version = var.database_version

  deletion_protection = var.deletion_protection

  settings {
    tier              = var.tier
    availability_type = var.availability_type
    disk_autoresize   = true
    disk_size         = var.disk_size_gb
    disk_type         = var.disk_type
    user_labels       = var.labels

    backup_configuration {
      enabled = var.backup_enabled
    }

    ip_configuration {
      ipv4_enabled = var.ipv4_enabled
    }
  }
}

resource "google_sql_database" "application" {
  project  = var.project_id
  name     = var.database_name
  instance = google_sql_database_instance.this.name
}

resource "google_sql_user" "application" {
  project  = var.project_id
  name     = var.app_user_name
  instance = google_sql_database_instance.this.name
  password = var.app_user_password
}
