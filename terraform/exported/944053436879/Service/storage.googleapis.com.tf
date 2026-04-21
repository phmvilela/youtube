resource "google_project_service" "storage_googleapis_com" {
  project = "944053436879"
  service = "storage.googleapis.com"
}
# terraform import google_project_service.storage_googleapis_com 944053436879/storage.googleapis.com
