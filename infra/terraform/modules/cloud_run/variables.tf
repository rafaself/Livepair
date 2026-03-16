variable "project_id" {
  description = "Google Cloud project ID that owns the Cloud Run service."
  type        = string
}

variable "location" {
  description = "Region for the Cloud Run service."
  type        = string
}

variable "service_name" {
  description = "Cloud Run service name."
  type        = string
}

variable "service_account_email" {
  description = "Runtime service account email attached to the Cloud Run revision."
  type        = string
}

variable "image" {
  description = "Fully qualified container image reference to deploy."
  type        = string
}

variable "container_port" {
  description = "Container port exposed by the application. Cloud Run injects PORT with this value."
  type        = number
  default     = 8080
}

variable "ingress" {
  description = "Cloud Run ingress setting."
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"
}

variable "deletion_protection" {
  description = "Whether Terraform should prevent destroying the Cloud Run service."
  type        = bool
  default     = false
}

variable "allow_unauthenticated" {
  description = "Whether to grant public run.invoker access to the service."
  type        = bool
  default     = true
}

variable "min_instance_count" {
  description = "Minimum number of Cloud Run instances."
  type        = number
  default     = 0
}

variable "max_instance_count" {
  description = "Maximum number of Cloud Run instances."
  type        = number
  default     = 2
}

variable "timeout" {
  description = "Per-request timeout for the Cloud Run service, for example 300s."
  type        = string
  default     = "300s"
}

variable "cpu" {
  description = "CPU limit for the Cloud Run container."
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory limit for the Cloud Run container."
  type        = string
  default     = "512Mi"
}

variable "cpu_idle" {
  description = "Whether CPU is allocated only during request handling."
  type        = bool
  default     = true
}

variable "startup_cpu_boost" {
  description = "Whether to enable startup CPU boost for cold starts."
  type        = bool
  default     = true
}

variable "environment_variables" {
  description = "Non-secret environment variables injected into the container."
  type        = map(string)
  default     = {}
}

variable "secret_environment_variables" {
  description = "Secret-backed environment variables injected from Secret Manager."
  type = map(object({
    secret  = string
    version = optional(string, "latest")
  }))
  default = {}
}

variable "cloud_sql_instance_connection_names" {
  description = "Cloud SQL instance connection names to attach through the Cloud Run Cloud SQL volume."
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Labels applied to the Cloud Run service."
  type        = map(string)
  default     = {}
}
