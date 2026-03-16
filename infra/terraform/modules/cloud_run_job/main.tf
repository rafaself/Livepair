locals {
  sorted_environment_variables = {
    for key in sort(keys(var.environment_variables)) : key => var.environment_variables[key]
  }

  sorted_secret_environment_variables = {
    for key in sort(keys(var.secret_environment_variables)) : key => var.secret_environment_variables[key]
  }
}

resource "google_cloud_run_v2_job" "this" {
  project             = var.project_id
  name                = var.job_name
  location            = var.location
  deletion_protection = var.deletion_protection
  labels              = var.labels

  template {
    task_count  = var.task_count
    parallelism = var.parallelism

    template {
      service_account = var.service_account_email
      timeout         = var.timeout
      max_retries     = var.max_retries

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
        image   = var.image
        command = var.command
        args    = var.args

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
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
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
    ]

    precondition {
      condition     = var.task_count > 0
      error_message = "task_count must be greater than 0."
    }

    precondition {
      condition     = var.parallelism > 0 && var.parallelism <= var.task_count
      error_message = "parallelism must be greater than 0 and less than or equal to task_count."
    }
  }
}
