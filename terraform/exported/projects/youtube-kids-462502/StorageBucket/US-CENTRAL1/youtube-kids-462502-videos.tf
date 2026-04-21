resource "google_storage_bucket" "youtube_kids_462502_videos" {
  force_destroy = false

  labels = {
    managed-by-cnrm = "true"
  }

  location                 = "US-CENTRAL1"
  name                     = "youtube-kids-462502-videos"
  project                  = "youtube-kids-462502"
  public_access_prevention = "inherited"

  soft_delete_policy {
    retention_duration_seconds = 604800
  }

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
}
# terraform import google_storage_bucket.youtube_kids_462502_videos youtube-kids-462502-videos
