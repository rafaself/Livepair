variable "project_id" {
  description = "Google Cloud project ID where services should be enabled."
  type        = string
}

variable "services" {
  description = "Set of Google APIs to enable for the project."
  type        = set(string)
}

variable "disable_on_destroy" {
  description = "Whether Terraform should disable APIs when this module is destroyed."
  type        = bool
  default     = false
}
