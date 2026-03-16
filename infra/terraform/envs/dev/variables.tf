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
    version               = string
    tier                  = string
    availability_type     = string
    disk_size_gb          = number
    disk_type             = string
    backup_enabled        = bool
    ipv4_enabled          = bool
    deletion_protection   = bool
    database_name         = string
    app_user_name         = string
    app_user_password     = string
  })
}
