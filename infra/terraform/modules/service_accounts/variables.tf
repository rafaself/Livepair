variable "project_id" {
  description = "Google Cloud project ID that owns the service accounts."
  type        = string
}

variable "service_accounts" {
  description = "Service accounts to create, keyed by a logical name."
  type = map(object({
    account_id    = string
    display_name  = string
    description   = string
    project_roles = list(string)
  }))
}
