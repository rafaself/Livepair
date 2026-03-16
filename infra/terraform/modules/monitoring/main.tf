locals {
  monitored_host = trimsuffix(
    trimprefix(trimprefix(var.target_url, "https://"), "http://"),
    "/",
  )
  monitored_path = startswith(var.path, "/") ? var.path : "/${var.path}"

  telemetry_metric_labels = {
    environment = {
      description = "Telemetry environment emitted by the desktop client."
      extractor   = "EXTRACT(jsonPayload.environment)"
    }
    platform = {
      description = "Desktop platform emitted by the telemetry event."
      extractor   = "EXTRACT(jsonPayload.platform)"
    }
    model = {
      description = "Gemini model reported by the telemetry event."
      extractor   = "EXTRACT(jsonPayload.model)"
    }
    app_version = {
      description = "Desktop app version that emitted the telemetry event."
      extractor   = "EXTRACT(jsonPayload.appVersion)"
    }
  }

  telemetry_metric_label_extractors = {
    for key, value in local.telemetry_metric_labels :
    key => value.extractor
  }

  telemetry_log_filter_parts = [
    "resource.type=\"cloud_run_revision\"",
    "resource.labels.service_name=\"${var.cloud_run_service_name}\"",
    "resource.labels.location=\"${var.cloud_run_location}\"",
    "jsonPayload.component=\"live-telemetry\"",
    "jsonPayload.message=\"Accepted Gemini Live telemetry event\"",
  ]

  telemetry_log_filter = join(" AND ", local.telemetry_log_filter_parts)

  telemetry_counter_metrics = {
    live_session_started_count = {
      description = "Count of Gemini Live sessions that started."
      filter      = "${local.telemetry_log_filter} AND jsonPayload.eventType=\"live_session_started\""
    }
    live_session_error_count = {
      description = "Count of Gemini Live session error events accepted by the API."
      filter      = "${local.telemetry_log_filter} AND jsonPayload.eventType=\"live_session_error\""
    }
    live_session_resume_count = {
      description = "Count of Gemini Live session resume events."
      filter      = "${local.telemetry_log_filter} AND jsonPayload.eventType=\"live_session_resumed\""
    }
  }

  telemetry_distribution_metrics = {
    live_session_duration_ms = {
      description     = "Distribution of Gemini Live session durations in milliseconds."
      filter          = "${local.telemetry_log_filter} AND jsonPayload.eventType=\"live_session_ended\" AND jsonPayload.durationMs:*"
      value_extractor = "EXTRACT(jsonPayload.durationMs)"
      unit            = "ms"
      bucket_bounds   = [5000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000]
    }
    live_session_total_tokens = {
      description     = "Distribution of total Gemini Live token counts reported by usage summary events."
      filter          = "${local.telemetry_log_filter} AND jsonPayload.eventType=\"live_usage_reported\" AND jsonPayload.usage.totalTokenCount:*"
      value_extractor = "EXTRACT(jsonPayload.usage.totalTokenCount)"
      unit            = "1"
      bucket_bounds   = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000]
    }
    live_connect_latency_ms = {
      description     = "Distribution of Gemini Live connection latency in milliseconds for connect and resume events."
      filter          = "${local.telemetry_log_filter} AND (jsonPayload.eventType=\"live_session_connected\" OR jsonPayload.eventType=\"live_session_resumed\") AND jsonPayload.connectLatencyMs:*"
      value_extractor = "EXTRACT(jsonPayload.connectLatencyMs)"
      unit            = "ms"
      bucket_bounds   = [100, 250, 500, 1000, 2000, 3000, 5000, 10000]
    }
    live_first_response_latency_ms = {
      description     = "Distribution of Gemini Live first-response latency in milliseconds."
      filter          = "${local.telemetry_log_filter} AND jsonPayload.eventType=\"live_session_ended\" AND jsonPayload.firstResponseLatencyMs:*"
      value_extractor = "EXTRACT(jsonPayload.firstResponseLatencyMs)"
      unit            = "ms"
      bucket_bounds   = [100, 250, 500, 1000, 2000, 5000, 10000]
    }
  }

  telemetry_metric_types = merge(
    {
      for name, _ in local.telemetry_counter_metrics :
      name => "logging.googleapis.com/user/${name}"
    },
    {
      for name, _ in local.telemetry_distribution_metrics :
      name => "logging.googleapis.com/user/${name}"
    },
  )

  telemetry_alert_filter_suffix = join(
    " AND ",
    [
      "resource.type=\"cloud_run_revision\"",
      "resource.label.service_name=\"${var.cloud_run_service_name}\"",
      "resource.label.location=\"${var.cloud_run_location}\"",
    ],
  )
}

resource "google_monitoring_uptime_check_config" "api_health" {
  project            = var.project_id
  display_name       = var.uptime_check_display_name
  timeout            = var.timeout
  period             = var.period
  log_check_failures = true
  user_labels = merge(var.user_labels, {
    signal = "uptime"
  })

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
  user_labels = merge(var.user_labels, {
    signal = "uptime"
  })

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

resource "google_logging_metric" "telemetry_counters" {
  for_each = local.telemetry_counter_metrics

  project     = var.project_id
  name        = each.key
  description = each.value.description
  filter      = each.value.filter

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    dynamic "labels" {
      for_each = local.telemetry_metric_labels
      content {
        key         = labels.key
        value_type  = "STRING"
        description = labels.value.description
      }
    }
  }

  label_extractors = local.telemetry_metric_label_extractors
}

resource "google_logging_metric" "telemetry_distributions" {
  for_each = local.telemetry_distribution_metrics

  project         = var.project_id
  name            = each.key
  description     = each.value.description
  filter          = each.value.filter
  value_extractor = each.value.value_extractor

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = each.value.unit

    dynamic "labels" {
      for_each = local.telemetry_metric_labels
      content {
        key         = labels.key
        value_type  = "STRING"
        description = labels.value.description
      }
    }
  }

  bucket_options {
    explicit_buckets {
      bounds = each.value.bucket_bounds
    }
  }

  label_extractors = local.telemetry_metric_label_extractors
}

resource "google_monitoring_alert_policy" "live_session_error_spike" {
  project               = var.project_id
  display_name          = "Gemini Live telemetry error spike"
  combiner              = "OR"
  enabled               = true
  notification_channels = var.notification_channel_names
  user_labels = merge(var.user_labels, {
    signal = "telemetry"
  })

  conditions {
    display_name = "Gemini Live session error count is spiking"

    condition_threshold {
      filter = join(
        " AND ",
        [
          "metric.type=\"${local.telemetry_metric_types["live_session_error_count"]}\"",
          local.telemetry_alert_filter_suffix,
        ],
      )
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.telemetry_error_spike_threshold

      aggregations {
        alignment_period     = var.telemetry_error_spike_alignment_period
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }
}

resource "google_monitoring_alert_policy" "live_session_started_absent" {
  project               = var.project_id
  display_name          = "Gemini Live telemetry session starts absent"
  combiner              = "OR"
  enabled               = true
  notification_channels = var.notification_channel_names
  user_labels = merge(var.user_labels, {
    signal = "telemetry"
  })

  conditions {
    display_name = "No Gemini Live session starts observed"

    condition_absent {
      filter = join(
        " AND ",
        [
          "metric.type=\"${local.telemetry_metric_types["live_session_started_count"]}\"",
          local.telemetry_alert_filter_suffix,
        ],
      )
      duration = var.telemetry_started_absence_duration

      aggregations {
        alignment_period     = var.telemetry_started_absence_duration
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }
}

resource "google_monitoring_alert_policy" "live_connect_latency_high" {
  project               = var.project_id
  display_name          = "Gemini Live telemetry connect latency high"
  combiner              = "OR"
  enabled               = true
  notification_channels = var.notification_channel_names
  user_labels = merge(var.user_labels, {
    signal = "telemetry"
  })

  conditions {
    display_name = "Gemini Live connect latency p95 is high"

    condition_threshold {
      filter = join(
        " AND ",
        [
          "metric.type=\"${local.telemetry_metric_types["live_connect_latency_ms"]}\"",
          local.telemetry_alert_filter_suffix,
        ],
      )
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.telemetry_connect_latency_threshold_ms

      aggregations {
        alignment_period     = var.telemetry_connect_latency_alignment_period
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }
}
