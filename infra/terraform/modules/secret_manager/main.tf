locals {
  secret_accessors = flatten([
    for secret_key, secret in var.secrets : [
      for accessor in secret.accessors : {
        binding_key = "${secret_key}:${accessor}"
        secret_key  = secret_key
        accessor    = accessor
      }
    ]
  ])
}

resource "google_secret_manager_secret" "this" {
  for_each = var.secrets

  project   = var.project_id
  secret_id = each.value.secret_id
  labels    = merge(var.labels, each.value.labels)

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each = {
    for binding in local.secret_accessors : binding.binding_key => binding
  }

  project   = var.project_id
  secret_id = google_secret_manager_secret.this[each.value.secret_key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = format("serviceAccount:%s", each.value.accessor)
}
