# App-owned bucket for video content.
# GCP-managed buckets (gcf-v2-sources, gcf-v2-uploads, run-sources)
# are auto-created by Cloud Functions / Cloud Run and excluded from Terraform.

resource "google_storage_bucket" "videos" {
  project       = var.project_id
  name          = var.videos_bucket_name
  location      = upper(var.region)
  storage_class = "STANDARD"
  force_destroy = false

  uniform_bucket_level_access = true
  public_access_prevention    = "inherited"

  soft_delete_policy {
    retention_duration_seconds = 604800
  }
}
