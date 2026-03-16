locals {
  project_role_bindings = flatten([
    for sa_key, sa in var.service_accounts : [
      for role in sa.project_roles : {
        binding_key = "${sa_key}:${role}"
        sa_key      = sa_key
        role        = role
      }
    ]
  ])
}

resource "google_service_account" "this" {
  for_each = var.service_accounts

  project      = var.project_id
  account_id   = each.value.account_id
  display_name = each.value.display_name
  description  = each.value.description
}

resource "google_project_iam_member" "project_role" {
  for_each = {
    for binding in local.project_role_bindings : binding.binding_key => binding
  }

  project = var.project_id
  role    = each.value.role
  member  = format("serviceAccount:%s", google_service_account.this[each.value.sa_key].email)
}
