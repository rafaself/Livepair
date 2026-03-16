variable "project_id" {
  description = "Google Cloud project ID where monitoring resources should be created."
  type        = string
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
