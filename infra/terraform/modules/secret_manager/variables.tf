variable "project_id" {
  description = "Google Cloud project ID that owns the secrets."
  type        = string
}

variable "labels" {
  description = "Common labels to apply to all secret containers."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Secret containers to create, keyed by logical name."
  type = map(object({
    secret_id = string
    labels    = map(string)
    accessors = list(string)
  }))
}
