variable "project_id" {
  description = "Google Cloud project ID where monitoring resources should be created."
  type        = string
}

variable "cloud_run_service_name" {
  description = "Cloud Run service name whose logs should back Gemini Live telemetry metrics."
  type        = string
}

variable "cloud_run_location" {
  description = "Cloud Run region for the service whose logs should back Gemini Live telemetry metrics."
  type        = string
}

variable "telemetry_metric_name_prefix" {
  description = "Optional prefix applied to Gemini Live telemetry log-based metric names to avoid cross-environment collisions."
  type        = string
  default     = ""
}

variable "target_url" {
  description = "Public base URL to probe with the uptime check."
  type        = string
}

variable "path" {
  description = "HTTP path to probe on the target URL."
  type        = string
  default     = "/health"
}

variable "uptime_check_display_name" {
  description = "Human-friendly display name for the uptime check."
  type        = string
}

variable "alert_policy_display_name" {
  description = "Human-friendly display name for the alert policy."
  type        = string
}

variable "period" {
  description = "How often to run the uptime check."
  type        = string
  default     = "60s"
}

variable "timeout" {
  description = "How long the uptime check waits for a response."
  type        = string
  default     = "10s"
}

variable "failure_duration" {
  description = "How long the uptime check must fail before the alert opens."
  type        = string
  default     = "120s"
}

variable "telemetry_error_spike_alignment_period" {
  description = "Rolling window used to sum Gemini Live session error counts for the spike alert."
  type        = string
  default     = "300s"
}

variable "telemetry_error_spike_threshold" {
  description = "Total Gemini Live session errors within the rolling window that opens the spike alert."
  type        = number
  default     = 3
}

variable "telemetry_started_absence_duration" {
  description = "How long no Gemini Live session starts can be observed before the absence alert opens."
  type        = string
  default     = "900s"
}

variable "telemetry_connect_latency_alignment_period" {
  description = "Rolling window used to evaluate Gemini Live connection latency."
  type        = string
  default     = "300s"
}

variable "telemetry_connect_latency_threshold_ms" {
  description = "P95 Gemini Live connect latency in milliseconds that opens the latency alert."
  type        = number
  default     = 2500
}

variable "telemetry_metric_propagation_duration" {
  description = "Wait time after creating telemetry log-based metrics before binding alert policies to them."
  type        = string
  default     = "60s"
}

variable "notification_channel_names" {
  description = "Existing Cloud Monitoring notification channel resource names to attach to the alert policy."
  type        = list(string)
  default     = []
}

variable "user_labels" {
  description = "User labels applied to monitoring resources."
  type        = map(string)
  default     = {}
}
