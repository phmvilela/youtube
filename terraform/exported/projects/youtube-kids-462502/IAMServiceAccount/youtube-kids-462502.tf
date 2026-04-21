resource "google_service_account" "youtube_kids_462502" {
  account_id   = "youtube-kids-462502"
  display_name = "App Engine default service account"
  project      = "youtube-kids-462502"
}
# terraform import google_service_account.youtube_kids_462502 projects/youtube-kids-462502/serviceAccounts/youtube-kids-462502@youtube-kids-462502.iam.gserviceaccount.com
