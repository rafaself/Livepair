locals {
  monitored_host = trimsuffix(
    trimprefix(trimprefix(var.target_url, "https://"), "http://"),
    "/",
  )
  monitored_path = startswith(var.path, "/") ? var.path : "/${var.path}"
}

resource "google_monitoring_uptime_check_config" "api_health" {
  project            = var.project_id
  display_name       = var.uptime_check_display_name
  timeout            = var.timeout
  period             = var.period
  log_check_failures = true
  user_labels        = var.user_labels

  http_check {
    path           = local.monitored_path
    request_method = "GET"
    use_ssl        = true
    validate_ssl   = true

    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = local.monitored_host
    }
  }
}

resource "google_monitoring_alert_policy" "api_health_failed" {
  project               = var.project_id
  display_name          = var.alert_policy_display_name
  combiner              = "OR"
  enabled               = true
  notification_channels = var.notification_channel_names
  user_labels           = var.user_labels

  conditions {
    display_name = "Public /health uptime check is failing"

    condition_threshold {
      filter = join(
        " AND ",
        [
          "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\"",
          "resource.type=\"uptime_url\"",
          "metric.label.\"check_id\"=\"${google_monitoring_uptime_check_config.api_health.uptime_check_id}\"",
        ],
      )
      duration        = var.failure_duration
      comparison      = "COMPARISON_LT"
      threshold_value = 1

      aggregations {
        alignment_period   = var.period
        per_series_aligner = "ALIGN_NEXT_OLDER"
      }

      trigger {
        count = 1
      }
    }
  }
}
