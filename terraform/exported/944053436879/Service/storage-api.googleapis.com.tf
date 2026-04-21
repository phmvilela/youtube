resource "google_project_service" "storage_api_googleapis_com" {
  project = "944053436879"
  service = "storage-api.googleapis.com"
}
# terraform import google_project_service.storage_api_googleapis_com 944053436879/storage-api.googleapis.com
