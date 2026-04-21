resource "google_service_account" "944053436879_compute" {
  account_id   = "944053436879-compute"
  display_name = "Default compute service account"
  project      = "youtube-kids-462502"
}
# terraform import google_service_account.944053436879_compute projects/youtube-kids-462502/serviceAccounts/944053436879-compute@youtube-kids-462502.iam.gserviceaccount.com
