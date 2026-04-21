resource "google_service_account" "video_sync_function_sa" {
  account_id = "video-sync-function-sa"
  project    = "youtube-kids-462502"
}
# terraform import google_service_account.video_sync_function_sa projects/youtube-kids-462502/serviceAccounts/video-sync-function-sa@youtube-kids-462502.iam.gserviceaccount.com
