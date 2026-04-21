resource "google_service_account" "firebase_adminsdk_fbsvc" {
  account_id   = "firebase-adminsdk-fbsvc"
  description  = "Firebase Admin SDK Service Agent"
  display_name = "firebase-adminsdk"
  project      = "youtube-kids-462502"
}
# terraform import google_service_account.firebase_adminsdk_fbsvc projects/youtube-kids-462502/serviceAccounts/firebase-adminsdk-fbsvc@youtube-kids-462502.iam.gserviceaccount.com
