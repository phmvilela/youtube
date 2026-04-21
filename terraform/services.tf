resource "google_project_service" "services" {
  for_each = toset(var.gcp_services)

  project = var.project_id
  service = each.value

  disable_dependent_services = false
  disable_on_destroy         = false
}
