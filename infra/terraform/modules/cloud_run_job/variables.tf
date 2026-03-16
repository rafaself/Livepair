variable "project_id" {
  description = "Google Cloud project ID that owns the Cloud Run job."
  type        = string
}

variable "location" {
  description = "Region for the Cloud Run job."
  type        = string
}

variable "job_name" {
  description = "Cloud Run job name."
  type        = string
}

variable "service_account_email" {
  description = "Service account email attached to the Cloud Run job execution."
  type        = string
}

variable "image" {
  description = "Fully qualified container image reference for the job."
  type        = string
}

variable "command" {
  description = "Optional container command override."
  type        = list(string)
  default     = []
}

variable "args" {
  description = "Optional container args override."
  type        = list(string)
  default     = []
}

variable "timeout" {
  description = "Per-task timeout for the Cloud Run job, for example 600s."
  type        = string
  default     = "600s"
}

variable "task_count" {
  description = "Number of tasks to create for each job execution."
  type        = number
  default     = 1
}

variable "parallelism" {
  description = "Maximum number of tasks to run in parallel."
  type        = number
  default     = 1
}

variable "max_retries" {
  description = "Maximum number of retries per task."
  type        = number
  default     = 0
}

variable "cpu" {
  description = "CPU limit for the Cloud Run job container."
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory limit for the Cloud Run job container."
  type        = string
  default     = "512Mi"
}

variable "deletion_protection" {
  description = "Whether Terraform should prevent destroying the Cloud Run job."
  type        = bool
  default     = false
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
  description = "Labels applied to the Cloud Run job."
  type        = map(string)
  default     = {}
}
