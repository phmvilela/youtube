resource "google_storage_bucket" "run_sources_youtube_kids_462502_us_central1" {
  cors {
    method = ["GET"]
    origin = ["https://*.cloud.google.com", "https://*.corp.google.com", "https://*.corp.google.com:*", "https://*.cloud.google", "https://*.byoid.goog"]
  }

  force_destroy = false

  labels = {
    managed-by-cnrm = "true"
    used-by         = "cloudrun"
  }

  location                 = "US-CENTRAL1"
  name                     = "run-sources-youtube-kids-462502-us-central1"
  project                  = "youtube-kids-462502"
  public_access_prevention = "inherited"

  soft_delete_policy {
    retention_duration_seconds = 604800
  }

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
}
# terraform import google_storage_bucket.run_sources_youtube_kids_462502_us_central1 run-sources-youtube-kids-462502-us-central1
