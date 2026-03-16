variable "project_id" {
  description = "Google Cloud project ID for the dev environment."
  type        = string
}

variable "region" {
  description = "Primary Google Cloud region for shared dev resources."
  type        = string
}

variable "environment_name" {
  description = "Environment name used in naming and labels."
  type        = string
  default     = "dev"
}

variable "naming_prefix" {
  description = "Short prefix applied to Terraform-managed resources."
  type        = string
  default     = "livepair"
}

variable "database" {
  description = "Cloud SQL settings for the current environment."
  type = object({
    version             = string
    tier                = string
    availability_type   = string
    disk_size_gb        = number
    disk_type           = string
    backup_enabled      = bool
    ipv4_enabled        = bool
    deletion_protection = bool
    database_name       = string
    app_user_name       = string
    app_user_password   = string
  })
}

variable "api_service" {
  description = "Cloud Run deployment settings for the API service."
  type = object({
    image                 = string
    allow_unauthenticated = optional(bool, true)
    ingress               = optional(string, "INGRESS_TRAFFIC_ALL")
    deletion_protection   = optional(bool, false)
    min_instance_count    = optional(number, 0)
    max_instance_count    = optional(number, 2)
    timeout               = optional(string, "300s")
    container_port        = optional(number, 8080)
    cpu                   = optional(string, "1")
    memory                = optional(string, "512Mi")
    cpu_idle              = optional(bool, true)
    startup_cpu_boost     = optional(bool, true)
  })
}

variable "api_runtime" {
  description = "Non-secret runtime configuration injected into the API service."
  type = object({
    node_env             = optional(string, "production")
    cors_allowed_origins = optional(list(string), [])
    session_token_live_model = optional(
      string,
      "models/gemini-2.5-flash-native-audio-preview-12-2025",
    )
    session_token_rate_limit_max_requests            = optional(number, 5)
    session_token_rate_limit_window_ms               = optional(number, 60000)
    ephemeral_token_ttl_seconds                      = optional(number, 60)
    project_knowledge_search_model                   = optional(string, "models/gemini-2.5-flash")
    project_knowledge_file_search_store              = optional(string, "")
    project_knowledge_file_search_store_display_name = optional(string, "livepair-project-knowledge")
  })
  default = {}
}

variable "api_secret_versions" {
  description = "Secret Manager versions to reference from Cloud Run. Keep latest for simple dev rotation or pin explicit versions later."
  type = object({
    gemini_api_key            = optional(string, "latest")
    session_token_auth_secret = optional(string, "latest")
    database_url              = optional(string, "latest")
  })
  default = {}
}

variable "monitoring" {
  description = "Minimal Cloud Monitoring settings for the public API uptime check plus Gemini Live telemetry metrics and alerts."
  type = object({
    health_check_path          = optional(string, "/health")
    uptime_check_period        = optional(string, "60s")
    timeout                    = optional(string, "10s")
    alert_failure_duration     = optional(string, "120s")
    telemetry_error_spike_alignment_period = optional(string, "300s")
    telemetry_error_spike_threshold        = optional(number, 3)
    telemetry_started_absence_duration     = optional(string, "900s")
    telemetry_connect_latency_alignment_period = optional(string, "300s")
    telemetry_connect_latency_threshold_ms     = optional(number, 2500)
    notification_channel_names = optional(list(string), [])
  })
  default = {}
}
