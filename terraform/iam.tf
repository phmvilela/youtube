# App-owned service accounts.
# GCP-managed accounts (default compute SA, App Engine default SA,
# firebase-adminsdk) are auto-created and excluded from Terraform.

resource "google_service_account" "video_sync_function" {
  project    = var.project_id
  account_id = "video-sync-function-sa"
}

resource "google_service_account" "gas_firestore_sync" {
  project      = var.project_id
  account_id   = "gas-firestore-sync"
  description  = "Access Firestore from GAS for YouTube project"
  display_name = "gas-firestore-sync"
}

resource "google_service_account" "video_sync_gas" {
  project    = var.project_id
  account_id = "video-sync-gas-sa"
}
