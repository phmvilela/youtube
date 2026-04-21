resource "google_storage_bucket" "gcf_v2_uploads_944053436879_us_central1_cloudfunctions_appspot_com" {
  cors {
    method          = ["PUT"]
    origin          = ["https://*.cloud.google.com", "https://*.corp.google.com", "https://*.corp.google.com:*", "https://*.cloud.google", "https://*.byoid.goog"]
    response_header = ["content-type"]
  }

  force_destroy = false

  labels = {
    goog-managed-by = "cloudfunctions"
    managed-by-cnrm = "true"
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      age        = 1
      with_state = "ANY"
    }
  }

  location                 = "US-CENTRAL1"
  name                     = "gcf-v2-uploads-944053436879.us-central1.cloudfunctions.appspot.com"
  project                  = "youtube-kids-462502"
  public_access_prevention = "inherited"

  soft_delete_policy {
    retention_duration_seconds = 604800
  }

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
}
# terraform import google_storage_bucket.gcf_v2_uploads_944053436879_us_central1_cloudfunctions_appspot_com gcf-v2-uploads-944053436879.us-central1.cloudfunctions.appspot.com
