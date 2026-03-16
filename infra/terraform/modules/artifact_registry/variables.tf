variable "project_id" {
  description = "Google Cloud project ID that owns the repository."
  type        = string
}

variable "location" {
  description = "Region that hosts the Artifact Registry repository."
  type        = string
}

variable "repository_id" {
  description = "Artifact Registry repository identifier."
  type        = string
}

variable "description" {
  description = "Human-readable repository description."
  type        = string
}

variable "format" {
  description = "Artifact Registry repository format."
  type        = string
  default     = "DOCKER"
}

variable "labels" {
  description = "Labels to apply to the repository."
  type        = map(string)
  default     = {}
}
