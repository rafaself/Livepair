variable "project_id" {
  description = "Google Cloud project ID that owns the Cloud SQL resources."
  type        = string
}

variable "region" {
  description = "Region for the Cloud SQL instance."
  type        = string
}

variable "instance_name" {
  description = "Cloud SQL instance name."
  type        = string
}

variable "database_version" {
  description = "Cloud SQL database engine version."
  type        = string
}

variable "tier" {
  description = "Cloud SQL machine tier."
  type        = string
}

variable "availability_type" {
  description = "Cloud SQL availability type."
  type        = string
}

variable "disk_size_gb" {
  description = "Disk size in GB for the Cloud SQL instance."
  type        = number
}

variable "disk_type" {
  description = "Disk type for the Cloud SQL instance."
  type        = string
}

variable "backup_enabled" {
  description = "Whether automated backups are enabled."
  type        = bool
  default     = false
}

variable "ipv4_enabled" {
  description = "Whether the Cloud SQL instance should have a public IPv4 address."
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "Whether deletion protection is enabled on the Cloud SQL instance."
  type        = bool
}

variable "database_name" {
  description = "Primary application database name."
  type        = string
}

variable "app_user_name" {
  description = "Application database user name."
  type        = string
}

variable "app_user_password" {
  description = "Password for the application database user. Supply this at plan/apply time; do not commit a real value."
  type        = string
  sensitive   = true
}

variable "labels" {
  description = "Labels to apply to the Cloud SQL instance."
  type        = map(string)
  default     = {}
}
