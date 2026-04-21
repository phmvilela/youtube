resource "google_service_account" "gas_firestore_sync" {
  account_id   = "gas-firestore-sync"
  description  = "Access Firestore from GAS for YouTube project"
  display_name = "gas-firestore-sync"
  project      = "youtube-kids-462502"
}
# terraform import google_service_account.gas_firestore_sync projects/youtube-kids-462502/serviceAccounts/gas-firestore-sync@youtube-kids-462502.iam.gserviceaccount.com
