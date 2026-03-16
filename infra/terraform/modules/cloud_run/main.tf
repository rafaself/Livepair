locals {
  sorted_environment_variables = {
    for key in sort(keys(var.environment_variables)) : key => var.environment_variables[key]
  }

  sorted_secret_environment_variables = {
    for key in sort(keys(var.secret_environment_variables)) : key => var.secret_environment_variables[key]
  }
}

resource "google_cloud_run_v2_service" "this" {
  project             = var.project_id
  name                = var.service_name
  location            = var.location
  ingress             = var.ingress
  deletion_protection = var.deletion_protection
  labels              = var.labels

  scaling {
    min_instance_count = var.min_instance_count
    max_instance_count = var.max_instance_count
  }

  template {
    timeout         = var.timeout
    service_account = var.service_account_email
    labels          = var.labels

    dynamic "volumes" {
      for_each = length(var.cloud_sql_instance_connection_names) > 0 ? [1] : []

      content {
        name = "cloudsql"

        cloud_sql_instance {
          instances = var.cloud_sql_instance_connection_names
        }
      }
    }

    containers {
      image = var.image

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = var.cpu_idle
        startup_cpu_boost = var.startup_cpu_boost
      }

      dynamic "env" {
        for_each = local.sorted_environment_variables

        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.sorted_secret_environment_variables

        content {
          name = env.key

          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      dynamic "volume_mounts" {
        for_each = length(var.cloud_sql_instance_connection_names) > 0 ? [1] : []

        content {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  lifecycle {
    precondition {
      condition     = var.min_instance_count >= 0 && var.max_instance_count >= var.min_instance_count
      error_message = "Cloud Run scaling requires max_instance_count to be greater than or equal to min_instance_count."
    }

    precondition {
      condition     = var.container_port > 0 && var.container_port <= 65535
      error_message = "container_port must be a valid TCP port."
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = google_cloud_run_v2_service.this.project
  location = google_cloud_run_v2_service.this.location
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
